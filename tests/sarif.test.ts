import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  SARIF_VERSION,
  addWorkspaceRoot,
  buildChangeGate,
  buildWorkspaceChangeGate,
  changeGateSarif,
  createDecision,
  initLedger,
  initWorkspace,
  workspaceChangeGateSarif,
} from '../src/core';

async function makeRoot(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('SARIF gate output', () => {
  it('converts single-root violations with stable rule ids', async () => {
    const root = await makeRoot('horizon-sarif-');
    await fs.mkdir(path.join(root, 'src/core'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/core/index.ts'), 'export {};', 'utf8');
    const created = await createDecision(root, {
      title: 'Never commit credentials',
      summary: 'Credentials stay outside source control.',
      decision: 'Keep credentials outside Git.',
      consequences: 'Rotate any leaked secret.',
      status: 'draft',
      scope: ['src/core'],
      policy: { mode: 'block', requireEvidence: 'verified' },
      alternatives: [{ id: 'A-001', name: 'Commit .env', verdict: 'rejected', reason: 'Leak risk.' }],
      evidence: [{ id: 'E-001', type: 'file', value: 'src/core/index.ts', strength: 'strong' }],
    });

    const gate = await buildChangeGate(root, ['src/core/index.ts']);
    const sarif = changeGateSarif(gate);
    expect(sarif.version).toBe(SARIF_VERSION);
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe('Horizon Ledger');
    expect(sarif.runs[0].properties.verdict).toBe('block');
    expect(sarif.runs[0].results.map((result) => result.ruleId)).toContain('horizon/undecided');
    expect(sarif.runs[0].tool.driver.rules.map((rule) => rule.id)).toContain('horizon/undecided');
    const undecided = sarif.runs[0].results.find((result) => result.ruleId === 'horizon/undecided');
    expect(undecided?.level).toBe('error');
    expect(undecided?.message.text).toContain('not decided');
    expect(undecided?.partialFingerprints.horizonFinding).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it('converts workspace gate findings with rule identity', async () => {
    const workspaceRoot = await makeRoot('horizon-sarif-workspace-');
    const root = path.join(workspaceRoot, 'root');
    await fs.mkdir(path.join(root, 'src/core'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/core/index.ts'), 'export {};', 'utf8');
    await initLedger(root);
    await initWorkspace(workspaceRoot);
    await addWorkspaceRoot(workspaceRoot, root, 'governed');
    await createDecision(root, {
      title: 'Use SQLite',
      summary: 'SQLite keeps storage local.',
      decision: 'Use SQLite.',
      consequences: 'Data remains portable.',
      scope: ['src/core'],
      policy: { mode: 'block', requireEvidence: 'verified' },
      alternatives: [{ id: 'A-001', name: 'Postgres', verdict: 'rejected', reason: 'Too heavy.' }],
      evidence: [{ id: 'E-001', type: 'file', value: 'src/core/index.ts', strength: 'strong' }],
    });

    const gate = await buildWorkspaceChangeGate(workspaceRoot, 'main', 'HEAD', ['root/src/core/index.ts']);
    const sarif = workspaceChangeGateSarif(gate);
    expect(sarif.runs[0].properties.workspace).toBe(true);
    expect(sarif.runs[0].results.some((result) => result.ruleId === 'horizon/undecided')).toBe(true);
    expect(sarif.runs[0].results.some((result) => result.properties?.decisionId === 'D-0001')).toBe(true);
    expect(sarif.runs[0].tool.driver.rules.length).toBeGreaterThan(0);
  });

  it('uses one stable fingerprint for equivalent findings', async () => {
    const gate = await buildChangeGate(await makeRoot('horizon-sarif-empty-'), ['src/core/index.ts']);
    const first = changeGateSarif(gate).runs[0].results[0];
    const second = changeGateSarif(gate).runs[0].results[0];
    expect(first?.partialFingerprints.horizonFinding)
      .toBe(second?.partialFingerprints.horizonFinding);
  });
});
