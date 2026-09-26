import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  addWorkspaceRoot,
  createDecision,
  initLedger,
  initWorkspace,
  buildWorkspaceTrace,
  workspaceTraceMarkdown,
} from '../src/core';

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]) {
  return execFileAsync('git', args, { cwd });
}

async function makeRoot(prefix = 'horizon-workspace-trace-'): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('workspace commit trace', () => {
  it('attributes commits to workspace decisions with root provenance', async () => {
    const root = await makeRoot();
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'Horizon Test'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'test@horizon.local'], { cwd: root });

    const apiRoot = path.join(root, 'packages', 'api');
    const webRoot = path.join(root, 'packages', 'web');
    await initLedger(apiRoot);
    await initLedger(webRoot);

    await createDecision(apiRoot, {
      title: 'Use SQLite in API',
      summary: 'API storage uses SQLite.',
      context: 'The API needs local-first storage.',
      decision: 'Use SQLite.',
      consequences: 'The API remains portable.',
      scope: ['src'],
      alternatives: [{ id: 'A-001', name: 'Postgres', verdict: 'rejected', reason: 'Too heavy.' }],
    });
    await createDecision(webRoot, {
      id: 'D-0002',
      title: 'Use server components',
      summary: 'Server components keep state on the server.',
      context: 'The web app needs controlled rendering.',
      decision: 'Use server components.',
      consequences: 'Less client state.',
      scope: ['src'],
      alternatives: [{ id: 'A-001', name: 'Client components', verdict: 'rejected', reason: 'Too much state.' }],
    });

    await initWorkspace(root);
    await addWorkspaceRoot(root, apiRoot, 'api');
    await addWorkspaceRoot(root, webRoot, 'web');

    await fs.mkdir(path.join(apiRoot, 'src'), { recursive: true });
    await fs.mkdir(path.join(webRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(apiRoot, 'src', 'index.ts'), 'api base', 'utf8');
    await fs.writeFile(path.join(webRoot, 'src', 'index.ts'), 'web base', 'utf8');
    await git(root, 'add', 'packages/api/src/index.ts', 'packages/web/src/index.ts');
    await git(root, '-c', 'user.name=Horizon Test', '-c', 'user.email=test@horizon.local', 'commit', '-m', 'chore: base');
    const base = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();

    await fs.writeFile(path.join(apiRoot, 'src', 'storage.ts'), 'SQLite storage', 'utf8');
    await git(root, 'add', 'packages/api/src/storage.ts');
    await git(root, '-c', 'user.name=Horizon Test', '-c', 'user.email=test@horizon.local', 'commit', '-m', 'feat(api): add storage D-0001');
    const apiCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();

    await fs.writeFile(path.join(webRoot, 'src', 'page.tsx'), 'server page', 'utf8');
    await git(root, 'add', 'packages/web/src/page.tsx');
    await git(root, '-c', 'user.name=Horizon Test', '-c', 'user.email=test@horizon.local', 'commit', '-m', 'feat(web): add server page');
    const webCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();

    await fs.mkdir(path.join(root, 'docs'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs', 'unrelated.md'), 'not related', 'utf8');
    await git(root, 'add', 'docs/unrelated.md');
    await git(root, '-c', 'user.name=Horizon Test', '-c', 'user.email=test@horizon.local', 'commit', '-m', 'docs: unrelated');

    const trace = await buildWorkspaceTrace(root, base, 'HEAD');
        expect(trace.workspace).toBe('Horizon Workspace');
    expect(trace.summary.commits).toBe(3);
    expect(trace.summary.attributedCommits).toBe(2);
    expect(trace.summary.unattributedCommits).toBe(1);
    expect(trace.summary.decisions).toBe(2);
    expect(trace.summary.decisionsWithCommits).toBe(2);
    expect(trace.summary.matchedRoots).toBe(2);

    const apiTrace = trace.decisions.find((item) => item.rootName === 'api');
    const webTrace = trace.decisions.find((item) => item.rootName === 'web');
    expect(apiTrace?.commits.map((commit) => commit.sha)).toEqual([apiCommit.toLowerCase()]);
    expect(apiTrace?.commits[0].reasons).toEqual(['reference', 'scope']);
    expect(webTrace?.commits.map((commit) => commit.sha)).toEqual([webCommit.toLowerCase()]);
    expect(webTrace?.commits[0].reasons).toEqual(['scope']);

    const markdown = workspaceTraceMarkdown(trace);
    expect(markdown).toContain('[api] D-0001: Use SQLite in API');
    expect(markdown).toContain('[web] D-0002: Use server components');
    expect(markdown).toContain('Commits without workspace decision attribution');

    const filtered = await buildWorkspaceTrace(root, base, 'HEAD', { decisionId: 'D-0001' });
    expect(filtered.summary.decisions).toBe(1);
    expect(filtered.summary.attributedCommits).toBe(1);
  });
});




