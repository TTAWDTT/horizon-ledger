import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildPullRequestContext, pullRequestContextMarkdown, createDecision, initLedger, readLedger } from '../src/core';

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]) {
  return execFileAsync('git', args, { cwd });
}

describe('pull request context', () => {
  it('aggregates decisions for changed files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-pr-'));
    await initLedger(root);
    await createDecision(root, {
      title: 'Use SQLite for storage',
      summary: 'Local and portable.',
      context: 'Need offline operation.',
      decision: 'Use SQLite.',
      consequences: 'Simple local setup.',
      scope: ['src/core/storage'],
      evidence: [{ type: 'file', value: 'src/core/storage/index.ts', strength: 'strong' }],
    });

    await git(root, 'init');
    await git(root, 'config', 'user.name', 'Horizon Test');
    await git(root, 'config', 'user.email', 'test@example.com');
    await git(root, 'add', '.');
    await git(root, 'commit', '-m', 'base');
    const base = (await git(root, 'rev-parse', 'HEAD')).stdout.trim();

    await fs.mkdir(path.join(root, 'src', 'core', 'storage'), { recursive: true });
    await fs.mkdir(path.join(root, 'src', 'other'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'core', 'storage', 'index.ts'), 'export const store = "sqlite";');
    await fs.writeFile(path.join(root, 'src', 'other', 'index.ts'), 'export const other = 1;');
    await git(root, 'add', '.');
    await git(root, 'commit', '-m', 'change storage');
    const head = (await git(root, 'rev-parse', 'HEAD')).stdout.trim();

    const context = await buildPullRequestContext(root, base, head);
    expect(context.version).toBe(1);
    expect(context.files.length).toBe(2);
    expect(context.decisions.length).toBe(1);
    expect(context.decisions[0].id).toBe('D-0001');
    expect(pullRequestContextMarkdown(context)).toContain('Use SQLite for storage');
    expect((await readLedger(root)).length).toBe(1);
  });
});
