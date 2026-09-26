import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'bun:test';
import {
  COMPLIANCE_REPORT_KIND,
  COMPLIANCE_IN_TOTO_STATEMENT_TYPE,
  COMPLIANCE_PREDICATE_TYPE,
  createDecision,
  exportWorkspaceCompliance,
  initLedger,
  initWorkspace,
  inspectWorkspaceCompliance,
  parseWorkspaceCompliance,
  sha256Id,
  stableStringify,
  verifyWorkspaceCompliance,
  workspaceComplianceMarkdown,
  type ComplianceProfile,
} from '../src/core';

const execFileAsync = promisify(execFile);

async function makeWorkspaceCompliance(): Promise<string> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-compliance-'));
  await execFileAsync('git', ['init'], { cwd: workspaceRoot });
  await execFileAsync('git', ['config', 'user.name', 'Horizon Test'], { cwd: workspaceRoot });
  await execFileAsync('git', ['config', 'user.email', 'test@horizon.local'], { cwd: workspaceRoot });

  await initLedger(workspaceRoot);
  await initWorkspace(workspaceRoot, 'Compliance Workspace');
  await fs.mkdir(path.join(workspaceRoot, 'src', 'core'), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, 'src', 'core', 'index.ts'), 'export {};', 'utf8');

  await createDecision(workspaceRoot, {
    title: 'Use sealed local control evidence',
    summary: 'Compliance controls require durable evidence.',
    context: 'Auditors need deterministic evidence.',
    decision: 'Use local file evidence with sha256 seals.',
    consequences: 'Controls can be verified locally.',
    status: 'decided',
    tags: ['security', 'compliance'],
    scope: ['src/core'],
    alternatives: [{ id: 'A-001', name: 'No evidence', verdict: 'rejected', reason: 'Not auditable.' }],
    evidence: [{ id: 'E-001', type: 'file', value: 'src/core/index.ts', strength: 'strong' }],
  });
  await execFileAsync('git', ['add', '.'], { cwd: workspaceRoot });
  await execFileAsync('git', ['commit', '-m', 'feat: add compliance evidence'], { cwd: workspaceRoot });
  return workspaceRoot;
}

describe('workspace compliance report', () => {
  it('exports and verifies a self-contained compliance report', async () => {
    const workspaceRoot = await makeWorkspaceCompliance();
    const profile: ComplianceProfile = {
      schemaVersion: 1,
      id: 'security-baseline',
      name: 'Security baseline',
      version: '1.0.0',
      framework: 'internal-security',
      controls: [
        {
          id: 'C-001',
          title: 'Local control evidence is verified',
          requirement: 'A decided decision with verified evidence covers local storage.',
          tags: ['security'],
          requireEvidence: 'verified',
        },
        {
          id: 'C-002',
          title: 'Missing explicit control',
          requirement: 'This control intentionally has no matching decision.',
          decisionIds: ['D-999'],
          requireEvidence: 'verified',
        },
      ],
    };

    const report = await exportWorkspaceCompliance(workspaceRoot, profile);
    expect(report.kind).toBe(COMPLIANCE_REPORT_KIND);
    expect(report.schemaVersion).toBe(1);
    expect(report.reportId).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(report.statement._type).toBe(COMPLIANCE_IN_TOTO_STATEMENT_TYPE);
    expect(report.statement.predicateType).toBe(COMPLIANCE_PREDICATE_TYPE);
    expect(report.artifacts.map((artifact) => artifact.name)).toEqual([
      'decision-pack.json',
      'compliance-profile.json',
    ]);
    expect(report.statement.subject).toHaveLength(2);
    expect(report.summary.controls).toBe(2);
    expect(report.summary.passing).toBe(1);
    expect(report.summary.failing).toBe(1);
    expect(report.controls[0].status).toBe('pass');
    expect(report.controls[0].satisfiedDecisionIds).toHaveLength(1);
    expect(report.controls[1].status).toBe('fail');

    const raw = JSON.stringify(report);
    const parsed = parseWorkspaceCompliance(raw);
    expect(parsed.reportId).toBe(report.reportId);
    expect(parsed.statement.predicate.packId).toBe((parsed.artifacts[0].content as { packId: string }).packId);

    const inspection = inspectWorkspaceCompliance(raw);
    expect(inspection.artifacts).toHaveLength(2);
    expect(inspection.summary.failing).toBe(1);

    const verification = verifyWorkspaceCompliance(raw, {
      profileId: 'security-baseline',
      framework: 'internal-security',
      controls: 2,
      passing: 1,
      failing: 1,
    });
    expect(verification.ok).toBe(true);
    expect(workspaceComplianceMarkdown(parsed)).toContain('Controls: 1/2 passing');
  });

  it('rejects a tampered envelope', async () => {
    const workspaceRoot = await makeWorkspaceCompliance();
    const profile: ComplianceProfile = {
      schemaVersion: 1,
      id: 'tamper-test',
      name: 'Tamper test',
      version: '1.0.0',
      controls: [
        { id: 'C-001', title: 'Has evidence', tags: ['security'], requireEvidence: 'verified' },
      ],
    };
    const report = await exportWorkspaceCompliance(workspaceRoot, profile);
    const tampered = structuredClone(report);
    tampered.workspace.decisionCount += 1;
    expect(() => parseWorkspaceCompliance(JSON.stringify(tampered))).toThrow(/report id mismatch/u);
  });

  it('rejects inconsistent control evaluation even if the report id is recomputed', async () => {
    const workspaceRoot = await makeWorkspaceCompliance();
    const profile: ComplianceProfile = {
      schemaVersion: 1,
      id: 'evaluation-test',
      name: 'Evaluation test',
      version: '1.0.0',
      controls: [
        { id: 'C-001', title: 'Has evidence', tags: ['security'], requireEvidence: 'verified' },
      ],
    };
    const report = await exportWorkspaceCompliance(workspaceRoot, profile);
    const forged = structuredClone(report);
    forged.controls[0].status = 'fail';
    const { reportId, ...payload } = forged;
    const nextId = sha256Id(stableStringify(payload));
    const raw = JSON.stringify({ ...forged, reportId: nextId });
    expect(() => parseWorkspaceCompliance(raw)).toThrow(/control evaluation mismatch/u);
  });

  it('rejects an embedded profile digest mismatch even if the report id is recomputed', async () => {
    const workspaceRoot = await makeWorkspaceCompliance();
    const profile: ComplianceProfile = {
      schemaVersion: 1,
      id: 'digest-test',
      name: 'Digest test',
      version: '1.0.0',
      controls: [
        { id: 'C-001', title: 'Has evidence', tags: ['security'], requireEvidence: 'verified' },
      ],
    };
    const report = await exportWorkspaceCompliance(workspaceRoot, profile);
    const forged = structuredClone(report);
    forged.artifacts[1].digest.sha256 = '0'.repeat(64);
    const { reportId, ...payload } = forged;
    const nextId = sha256Id(stableStringify(payload));
    const raw = JSON.stringify({ ...report, ...forged, reportId: nextId });
    expect(() => parseWorkspaceCompliance(raw)).toThrow(/compliance-profile\.json.*content digest mismatch/u);
  });

  it('enforces verification expectations', async () => {
    const workspaceRoot = await makeWorkspaceCompliance();
    const profile: ComplianceProfile = {
      schemaVersion: 1,
      id: 'expectation-test',
      name: 'Expectation test',
      version: '1.0.0',
      controls: [
        { id: 'C-001', title: 'Has evidence', tags: ['security'], requireEvidence: 'verified' },
      ],
    };
    const report = await exportWorkspaceCompliance(workspaceRoot, profile);
    const raw = JSON.stringify(report);
    expect(() => verifyWorkspaceCompliance(raw, { reportId: 'sha256:' + 'f'.repeat(64) })).toThrow(/report id mismatch/u);
    expect(() => verifyWorkspaceCompliance(raw, { profileId: 'other' })).toThrow(/profile id mismatch/u);
    expect(() => verifyWorkspaceCompliance(raw, { controls: 99 })).toThrow(/control count mismatch/u);
    expect(verifyWorkspaceCompliance(raw, { profileId: 'expectation-test' }).ok).toBe(true);
  });
});
