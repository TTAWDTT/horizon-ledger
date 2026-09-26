import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  RELEASE_AUDIT_KIND,
  RELEASE_AUDIT_PREDICATE_TYPE,
  RELEASE_AUDIT_IN_TOTO_STATEMENT_TYPE,
  addWorkspaceRoot,
  createDecision,
  exportWorkspaceReleaseAudit,
  initLedger,
  initWorkspace,
  inspectWorkspaceReleaseAudit,
  parseWorkspaceReleaseAudit,
  sha256Id,
  stableStringify,
  verifyWorkspaceReleaseAudit,
  workspaceReleaseAuditMarkdown,
} from '../src/core';

const execFileAsync = promisify(execFile);

async function makeRoot(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function makeWorkspaceRelease(): Promise<string> {
  const workspaceRoot = await makeRoot('horizon-release-audit-');
  await initLedger(workspaceRoot);
  await initWorkspace(workspaceRoot);

  const root = path.join(workspaceRoot, 'root');
  await fs.mkdir(root, { recursive: true });
  await initLedger(root);
  await addWorkspaceRoot(workspaceRoot, root, 'governed');

  await fs.mkdir(path.join(root, 'src/core'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/core/index.ts'), 'export {};', 'utf8');

  await createDecision(root, {
    title: 'Keep release audits self-contained',
    summary: 'Release audits should be one inspectable artifact.',
    context: 'Auditors should not need to recombine decisions, gates, and traces by hand.',
    decision: 'Embed decisions, gate verdict, and commit trace in a hash-bound release audit.',
    consequences: 'Auditors can retain a portable record without a cloud service.',
    status: 'decided',
    scope: ['src/core'],
    policy: { mode: 'block', requireEvidence: 'verified' },
    alternatives: [{ id: 'A-001', name: 'Carry three files', verdict: 'rejected', reason: 'No shared binding.' }],
    evidence: [{ id: 'E-001', type: 'file', value: 'src/core/index.ts', strength: 'strong' }],
  });

  await fs.writeFile(path.join(workspaceRoot, '.gitignore'), '.horizon', 'utf8');
  await execFileAsync('git', ['init'], { cwd: workspaceRoot });
  await execFileAsync('git', ['config', 'user.name', 'Horizon Test'], { cwd: workspaceRoot });
  await execFileAsync('git', ['config', 'user.email', 'test@horizon.local'], { cwd: workspaceRoot });
  await execFileAsync('git', ['add', '.'], { cwd: workspaceRoot });
  await execFileAsync('git', ['-c', 'user.name=Horizon Test', '-c', 'user.email=test@horizon.local', 'commit', '-m', 'chore: base'], { cwd: workspaceRoot });
  await fs.writeFile(path.join(root, 'src/core', 'proof.md'), 'proof', 'utf8');
  await execFileAsync('git', ['add', 'root/src/core/proof.md'], { cwd: workspaceRoot });
  await execFileAsync('git', ['-c', 'user.name=Horizon Test', '-c', 'user.email=test@horizon.local', 'commit', '-m', 'feat: governed change D-0001'], { cwd: workspaceRoot });

  return workspaceRoot;
}

describe('workspace release audit', () => {
  it('exports and verifies a self-contained in-toto release audit', async () => {
    const workspaceRoot = await makeWorkspaceRelease();
    const audit = await exportWorkspaceReleaseAudit(workspaceRoot, { files: ['root/src/core/index.ts'] });

    expect(audit.kind).toBe(RELEASE_AUDIT_KIND);
    expect(audit.schemaVersion).toBe(1);
    expect(audit.releaseAuditId).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(audit.statement._type).toBe(RELEASE_AUDIT_IN_TOTO_STATEMENT_TYPE);
    expect(audit.statement.predicateType).toBe(RELEASE_AUDIT_PREDICATE_TYPE);
    expect(audit.artifacts.map((artifact) => artifact.name)).toEqual([
      'decision-pack.json',
      'gate-report.json',
      'commit-trace.json',
    ]);
    expect(audit.statement.subject).toHaveLength(3);
    expect(audit.statement.predicate.gateVerdict).toBe('pass');
    expect(audit.statement.predicate.coverage).toEqual({ governed: 1, unguarded: 0 });
    expect(audit.statement.predicate.trace.commits).toBeGreaterThan(0);
    expect(audit.statement.predicate.trace.attributedCommits).toBeGreaterThan(0);

    const parsed = parseWorkspaceReleaseAudit(JSON.stringify(audit));
    expect(parsed.releaseAuditId).toBe(audit.releaseAuditId);
    expect(parsed.statement.predicate.packId).toBe((parsed.artifacts[0].content as { packId: string }).packId);
    expect(parsed.statement.predicate.gateReportId).toBe((parsed.artifacts[1].content as { reportId: string }).reportId);
    expect(parsed.statement.predicate.trace).toEqual((parsed.artifacts[2].content as WorkspaceReleaseAudit['artifacts'][number]['content'] & { summary: typeof audit.statement.predicate.trace }).summary);

    const inspection = inspectWorkspaceReleaseAudit(JSON.stringify(audit));
    expect(inspection.artifacts).toHaveLength(3);
    expect(inspection.gateVerdict).toBe('pass');
    expect(inspection.changedFiles).toBe(1);
    expect(inspection.trace.attributedCommits).toBeGreaterThan(0);

    const verification = verifyWorkspaceReleaseAudit(JSON.stringify(audit), {
      gateVerdict: 'pass',
      packId: audit.statement.predicate.packId,
      traceCommits: audit.statement.predicate.trace.commits,
    });
    expect(verification.ok).toBe(true);
    expect(workspaceReleaseAuditMarkdown(parsed)).toContain('Verdict: **PASS**');
  });

  it('rejects a tampered envelope', async () => {
    const workspaceRoot = await makeWorkspaceRelease();
    const audit = await exportWorkspaceReleaseAudit(workspaceRoot, { files: ['root/src/core/index.ts'] });
    const tampered = structuredClone(audit);
    tampered.workspace.decisionCount += 1;
    expect(() => parseWorkspaceReleaseAudit(JSON.stringify(tampered))).toThrow(/release audit id mismatch/u);
  });

  it('rejects inconsistent trace metadata even if the envelope id is recomputed', async () => {
    const workspaceRoot = await makeWorkspaceRelease();
    const audit = await exportWorkspaceReleaseAudit(workspaceRoot, { files: ['root/src/core/index.ts'] });
    const forged = structuredClone(audit);
    forged.statement.predicate.trace.attributedCommits += 1;
    const { releaseAuditId, ...payload } = forged;
    const nextId = sha256Id(stableStringify(payload));
    const raw = JSON.stringify({ ...forged, releaseAuditId: nextId });
    expect(() => parseWorkspaceReleaseAudit(raw)).toThrow(/statement trace summary mismatch/u);
  });

  it('rejects an artifact digest mismatch even if the envelope id is recomputed', async () => {
    const workspaceRoot = await makeWorkspaceRelease();
    const audit = await exportWorkspaceReleaseAudit(workspaceRoot, { files: ['root/src/core/index.ts'] });
    const forged = structuredClone(audit);
    forged.artifacts[2].digest.sha256 = '0'.repeat(64);
    const { releaseAuditId, ...payload } = forged;
    const nextId = sha256Id(stableStringify(payload));
    const raw = JSON.stringify({ ...audit, ...forged, releaseAuditId: nextId });
    expect(() => parseWorkspaceReleaseAudit(raw)).toThrow(/commit-trace\.json.*content digest mismatch/u);
  });

  it('enforces verification expectations', async () => {
    const workspaceRoot = await makeWorkspaceRelease();
    const audit = await exportWorkspaceReleaseAudit(workspaceRoot, { files: ['root/src/core/index.ts'] });
    const raw = JSON.stringify(audit);
    expect(() => verifyWorkspaceReleaseAudit(raw, { releaseAuditId: 'sha256:' + 'f'.repeat(64) })).toThrow(/release audit id mismatch/u);
    expect(() => verifyWorkspaceReleaseAudit(raw, { gateVerdict: 'block' })).toThrow(/gate verdict mismatch/u);
    expect(() => verifyWorkspaceReleaseAudit(raw, { attributedCommits: 999 })).toThrow(/attributed commit count mismatch/u);
    expect(verifyWorkspaceReleaseAudit(raw, { gateVerdict: 'pass' }).ok).toBe(true);
  });
});
