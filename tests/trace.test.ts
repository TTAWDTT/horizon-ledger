import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { addEvidence, auditLedger, buildChangeGate, buildTrace, createDecision, initLedger, readLedger, traceMarkdown } from '../src/core';

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]) {
  return execFileAsync('git', args, { cwd });
}

async function makeGitRoot(prefix = 'horizon-trace-'): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await git(root, 'init');
  await git(root, 'config', 'user.name', 'Horizon Test');
  await git(root, 'config', 'user.email', 'test@horizon.local');
  return root;
}

async function commitFile(root: string, filePath: string, contents: string, message: string) {
  await fs.mkdir(path.dirname(path.join(root, filePath)), { recursive: true });
  await fs.writeFile(path.join(root, filePath), contents, 'utf8');
  await git(root, 'add', filePath);
  await git(root, '-c', 'user.name=Horizon Test', '-c', 'user.email=test@horizon.local', 'commit', '-m', message);
}

describe('commit trace', () => {
  it('attributes commits through evidence, scope, and commit-message reference', async () => {
    const root = await makeGitRoot();
    await initLedger(root);
    await commitFile(root, 'README.md', '# Trace fixture', 'base');
    await commitFile(root, 'src/core/index.ts', 'export {};', 'feat: use storage D-0001');
    await commitFile(root, 'docs/unrelated.md', 'not related', 'chore: unrelated');
    const commit = (await git(root, 'rev-parse', 'HEAD~1')).stdout.trim();

    const decision = await createDecision(root, {
      title: 'Use deterministic storage',
      summary: 'Storage must be deterministic and traceable.',
      context: 'Implementation commits should be attributable to decisions.',
      decision: 'Attribute implementation commits to decisions.',
      consequences: 'Unattributed commits become visible in release audits.',
      status: 'decided',
      scope: ['src/core'],
    });
    await addEvidence(root, decision.id, { type: 'commit', value: commit, strength: 'strong' });


    const gate = await buildChangeGate(root, ['src/core/storage.ts']);
    expect(gate.verdict).toBe('pass');

    const trace = await buildTrace(root, 'HEAD~2', 'HEAD', { decisionId: decision.id });
    expect(trace.summary.commits).toBe(2);
    expect(trace.summary.attributedCommits).toBe(1);
    expect(trace.summary.unattributedCommits).toBe(1);
    expect(trace.decisions).toHaveLength(1);
    expect(trace.decisions[0].commits).toHaveLength(1);
    expect(trace.decisions[0].commits[0].sha).toBe(commit.toLowerCase());
    expect(trace.decisions[0].commits[0].reasons).toEqual(['evidence', 'reference', 'scope']);
    expect(traceMarkdown(trace)).toContain('feat: use storage D-0001');
  });
});

describe('attributed commit evidence', () => {
  it('marks scope-attributed commit evidence and passes an attributed gate', async () => {
    const root = await makeGitRoot('horizon-attributed-');
    await initLedger(root);
    await commitFile(root, 'README.md', '# Attributed fixture', 'base');
    await commitFile(root, 'src/core/index.ts', 'export {};', 'feat: storage implementation');
    const commit = (await git(root, 'rev-parse', 'HEAD')).stdout.trim();

    const decision = await createDecision(root, {
      title: 'Use attributed implementation evidence',
      summary: 'Commit evidence must prove the implementation.',
      context: 'An arbitrary commit exists does not prove the decision.',
      decision: 'Require commits that touch the decision scope.',
      consequences: 'Unrelated commits no longer satisfy attributed evidence.',
      status: 'decided',
      scope: ['src/core'],
      policy: { mode: 'block', requireEvidence: 'attributed' },
      alternatives: [{ id: 'A-001', name: 'Any existing commit', verdict: 'rejected', reason: 'It proves nothing about scope.' }],
    });
    await addEvidence(root, decision.id, { type: 'commit', value: commit, strength: 'strong' });

    const ledger = await readLedger(root);
    const audit = await auditLedger(ledger, root);
    expect(audit.attributed).toBe(1);
    expect(audit.findings[0].status).toBe('verified');
    expect(audit.findings[0].attribution).toBe('scope');
    expect(audit.findings[0].sealed).toBe(true);
  });

  it('reports unrelated commit evidence as unattributed', async () => {
    const root = await makeGitRoot('horizon-unattributed-');
    await initLedger(root);
    await commitFile(root, 'docs/unrelated.md', 'not related', 'docs: unrelated');
    const commit = (await git(root, 'rev-parse', 'HEAD')).stdout.trim();

    await createDecision(root, {
      title: 'Require a scoped commit',
      summary: 'The decision must be tied to implementation.',
      context: 'A commit exists does not mean it is the implementation.',
      decision: 'Use commit evidence only when it is attributable.',
      consequences: 'Arbitrary commits fail the attributed gate.',
      status: 'decided',
      scope: ['src/core'],
      policy: { mode: 'block', requireEvidence: 'attributed' },
      alternatives: [{ id: 'A-001', name: 'Any existing commit', verdict: 'rejected', reason: 'It is not attributable.' }],
    });
    const decision = (await readLedger(root))[0];
    await addEvidence(root, decision.id, { type: 'commit', value: commit, strength: 'strong' });

    const audit = await auditLedger(await readLedger(root), root);
    expect(audit.attributed).toBe(0);
    expect(audit.findings[0].status).toBe('verified');
    expect(audit.findings[0].attribution).toBe('none');
  });
});



