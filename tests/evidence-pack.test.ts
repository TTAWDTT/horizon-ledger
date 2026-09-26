import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  EVIDENCE_PACK_KIND,
  EVIDENCE_PACK_PREDICATE_TYPE,
  IN_TOTO_STATEMENT_TYPE,
  addWorkspaceRoot,
  createDecision,
  exportWorkspaceEvidencePack,
  initLedger,
  initWorkspace,
  inspectWorkspaceEvidencePack,
  parseWorkspaceEvidencePack,
  sha256Id,
  stableStringify,
  verifyWorkspaceEvidencePack,
  workspaceEvidencePackMarkdown,
} from '../src/core';

async function makeRoot(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function makeWorkspaceEvidence(): Promise<{ workspaceRoot: string; root: string }> {
  const workspaceRoot = await makeRoot('horizon-evidence-workspace-');
  await initLedger(workspaceRoot);
  await initWorkspace(workspaceRoot);

  const root = path.join(workspaceRoot, 'root');
  await fs.mkdir(root, { recursive: true });
  await initLedger(root);
  await addWorkspaceRoot(workspaceRoot, root, 'governed');

  await fs.mkdir(path.join(root, 'src/core'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/core/index.ts'), 'export {};', 'utf8');

  await createDecision(root, {
    title: 'Keep policy packages portable',
    summary: 'Release evidence should be one inspectable artifact.',
    context: 'Consumers currently need to bind two files by hand.',
    decision: 'Embed the decision pack and gate report in a hash-bound package.',
    consequences: 'Audits can retain the exact decisions and verdict together.',
    status: 'decided',
    scope: ['src/core'],
    policy: { mode: 'block', requireEvidence: 'verified' },
    alternatives: [{ id: 'A-001', name: 'Carry two files', verdict: 'rejected', reason: 'No shared binding.' }],
    evidence: [{ id: 'E-001', type: 'file', value: 'src/core/index.ts', strength: 'strong' }],
  });

  return { workspaceRoot, root };
}

describe('workspace evidence package', () => {
  it('exports and verifies a self-contained in-toto evidence package', async () => {
    const { workspaceRoot } = await makeWorkspaceEvidence();
    const pack = await exportWorkspaceEvidencePack(workspaceRoot, { files: ['root/src/core/index.ts'] });

    expect(pack.kind).toBe(EVIDENCE_PACK_KIND);
    expect(pack.schemaVersion).toBe(1);
    expect(pack.evidencePackId).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(pack.statement._type).toBe(IN_TOTO_STATEMENT_TYPE);
    expect(pack.statement.predicateType).toBe(EVIDENCE_PACK_PREDICATE_TYPE);
    expect(pack.artifacts.map((artifact) => artifact.name)).toEqual(['decision-pack.json', 'gate-report.json']);
    expect(pack.statement.subject).toHaveLength(2);
    expect(pack.statement.predicate.gateVerdict).toBe('pass');
    expect(pack.statement.predicate.coverage).toEqual({ governed: 1, unguarded: 0 });

    const parsed = parseWorkspaceEvidencePack(JSON.stringify(pack));
    expect(parsed.evidencePackId).toBe(pack.evidencePackId);
    expect(parsed.statement.predicate.packId).toBe((parsed.artifacts[0].content as { packId: string }).packId);
    expect(parsed.statement.predicate.gateReportId).toBe((parsed.artifacts[1].content as { reportId: string }).reportId);

    const inspection = inspectWorkspaceEvidencePack(JSON.stringify(pack));
    expect(inspection.artifacts).toHaveLength(2);
    expect(inspection.gateVerdict).toBe('pass');
    expect(inspection.changedFiles).toBe(1);

    const verification = verifyWorkspaceEvidencePack(JSON.stringify(pack), {
      gateVerdict: 'pass',
      packId: pack.statement.predicate.packId,
    });
    expect(verification.ok).toBe(true);
    expect(workspaceEvidencePackMarkdown(parsed)).toContain('Verdict: **PASS**');
  });

  it('rejects a tampered envelope', async () => {
    const { workspaceRoot } = await makeWorkspaceEvidence();
    const pack = await exportWorkspaceEvidencePack(workspaceRoot, { files: ['root/src/core/index.ts'] });
    const tampered = structuredClone(pack);
    tampered.workspace.decisionCount += 1;
    expect(() => parseWorkspaceEvidencePack(JSON.stringify(tampered))).toThrow(/evidence pack id mismatch/u);
  });

  it('rejects inconsistent statement metadata even if the envelope id is recomputed', async () => {
    const { workspaceRoot } = await makeWorkspaceEvidence();
    const pack = await exportWorkspaceEvidencePack(workspaceRoot, { files: ['root/src/core/index.ts'] });
    const forged = structuredClone(pack);
    forged.statement.predicate.gateVerdict = 'warn';
    const { evidencePackId, ...payload } = forged;
    const nextId = sha256Id(stableStringify(payload));
    const raw = JSON.stringify({ ...forged, evidencePackId: nextId });
    expect(() => parseWorkspaceEvidencePack(raw)).toThrow(/statement gate verdict mismatch/u);
  });

  it('rejects an artifact digest mismatch even if the envelope id is recomputed', async () => {
    const { workspaceRoot } = await makeWorkspaceEvidence();
    const pack = await exportWorkspaceEvidencePack(workspaceRoot, { files: ['root/src/core/index.ts'] });
    const forged = structuredClone(pack);
    forged.artifacts[0].digest.sha256 = '0'.repeat(64);
    const { evidencePackId, ...payload } = forged;
    const nextId = sha256Id(stableStringify(payload));
    const raw = JSON.stringify({ ...forged, evidencePackId: nextId });
    expect(() => parseWorkspaceEvidencePack(raw)).toThrow(/decision-pack.json.*content digest mismatch/u);
  });

  it('enforces verification expectations', async () => {
    const { workspaceRoot } = await makeWorkspaceEvidence();
    const pack = await exportWorkspaceEvidencePack(workspaceRoot, { files: ['root/src/core/index.ts'] });
    const raw = JSON.stringify(pack);
    expect(() => verifyWorkspaceEvidencePack(raw, { evidencePackId: 'sha256:' + 'f'.repeat(64) })).toThrow(/evidence pack id mismatch/u);
    expect(() => verifyWorkspaceEvidencePack(raw, { gateReportId: 'sha256:' + 'f'.repeat(64) })).toThrow(/gate report id mismatch/u);
  });
});
