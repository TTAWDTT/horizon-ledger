import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  addWorkspaceRoot,
  createDecision,
  exportWorkspacePack,
  importWorkspacePack,
  planWorkspacePackImport,
  inspectWorkspacePack,
  initLedger,
  initWorkspace,
  parseWorkspacePack,
  workspacePackMarkdown,
} from '../src/core';

async function makeRoot(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-pack-'));
}

describe('horizon workspace pack', () => {
  it('exports a deterministic, hash-bound pack', async () => {
    const first = await makeRoot();
    const second = await makeRoot();
    const workspaceRoot = await makeRoot();
    await initLedger(workspaceRoot);
    await initWorkspace(workspaceRoot);
    await initLedger(first);
    await addWorkspaceRoot(workspaceRoot, first, 'first');
    await initLedger(second);
    await addWorkspaceRoot(workspaceRoot, second, 'second');

    await fs.mkdir(path.join(first, 'src/core'), { recursive: true });
    await fs.writeFile(path.join(first, 'src/core/pack.ts'), 'export {};', 'utf8');

    await createDecision(first, {
      title: 'Use a decision pack',
      summary: 'Packs move decisions between machines.',
      context: 'Teams need portable context without a cloud service.',
      decision: 'Use deterministic JSON packs.',
      consequences: 'Audits remain reproducible.',
      scope: ['src/core'],
      alternatives: [{ id: 'A-001', name: 'Zip archive', verdict: 'deferred', reason: 'Too complex for v1.' }],
      evidence: [{ id: 'E-001', type: 'file', value: 'src', strength: 'strong' }],
    });
    await createDecision(second, {
      id: 'D-0002',
      title: 'Keep pack metadata bounded',
      summary: 'Packs do not copy working trees.',
      context: 'Bundles should stay inspectable.',
      decision: 'Store decisions and hashes, not live worktrees.',
      consequences: 'Sync stays reviewable and safe.',
      scope: ['docs'],
      alternatives: [{ id: 'A-001', name: 'Send live source', verdict: 'rejected', reason: 'Secrets and scale risk.' }],
    });

    const pack = await exportWorkspacePack(workspaceRoot);
    const again = await exportWorkspacePack(workspaceRoot);
    expect(pack.packId).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(again.packId).toBe(pack.packId);
    expect(pack.decisions).toHaveLength(2);
    expect(pack.decisions.every((item) => item.markdown.includes('## Decision'))).toBe(true);
    expect(workspacePackMarkdown(pack)).toContain('[first] D-0001');

    const inspection = await inspectWorkspacePack(JSON.stringify(pack));
    expect(inspection.decisionIds).toEqual(['D-0001', 'D-0002']);
    expect(inspection.audit.missing).toBe(0);

    const tampered = structuredClone(pack);
    tampered.decisions[0].markdown = tampered.decisions[0].markdown.replace('Use a decision pack', 'Changed');
    expect(() => parseWorkspacePack(JSON.stringify(tampered))).toThrow(/pack id mismatch/);
  });
  it('imports a pack idempotently', async () => {
    const source = await makeRoot();
    const destination = await makeRoot();
    await initLedger(source);
    await initWorkspace(destination);
    await initWorkspace(source);
    await createDecision(source, {
      title: 'Use decision packs',
      summary: 'Packs move decisions between machines.',
      context: 'Teams need portable context.',
      decision: 'Use deterministic packs.',
      consequences: 'Handoffs stay auditable.',
      scope: ['src/core'],
      alternatives: [{ id: 'A-001', name: 'Zip', verdict: 'deferred' }],
      evidence: [{ id: 'E-001', type: 'file', value: 'src/core', strength: 'strong' }],
    });

    const pack = await exportWorkspacePack(source);
    const plan = await planWorkspacePackImport(destination, JSON.stringify(pack));
    expect(plan.ok).toBe(true);
    expect(plan.createRoots).toBe(1);
    expect(plan.createDecisions).toBe(1);

    const imported = await importWorkspacePack(destination, JSON.stringify(pack));
    expect(imported.write).toBe(true);
    expect(imported.createDecisions).toBe(1);

    const again = await planWorkspacePackImport(destination, JSON.stringify(pack));
    expect(again.createDecisions).toBe(0);
    expect(again.reuseDecisions).toBe(1);

    const importedPack = await exportWorkspacePack(destination);
    expect(importedPack.decisions.map((item) => item.decision.id)).toContain('D-0001');
  });
  it('blocks conflicting decision ids', async () => {
    const source = await makeRoot();
    const destination = await makeRoot();
    await initLedger(source);
    await initWorkspace(source);
    await initLedger(destination);
    await initWorkspace(destination);

    await createDecision(source, {
      title: 'Use SQLite',
      summary: 'SQLite keeps data local.',
      context: 'Local-first storage is required.',
      decision: 'Use SQLite.',
      consequences: 'Data stays portable.',
      scope: ['src'],
      alternatives: [{ id: 'A-001', name: 'Postgres', verdict: 'rejected', reason: 'Too heavy.' }],
      evidence: [{ id: 'E-001', type: 'file', value: 'src', strength: 'strong' }],
    });
    await createDecision(destination, {
      id: 'D-0001',
      title: 'Use hosted Postgres',
      summary: 'Postgres fits multi-tenant workloads.',
      context: 'The service is multi-tenant.',
      decision: 'Use hosted Postgres.',
      consequences: 'Data is remote.',
      scope: ['src'],
      alternatives: [{ id: 'A-001', name: 'SQLite', verdict: 'rejected', reason: 'Too limited.' }],
    });

    const pack = await exportWorkspacePack(source);
    const plan = await planWorkspacePackImport(destination, JSON.stringify(pack));
    expect(plan.ok).toBe(false);
    expect(plan.conflicts).toBe(1);
    expect(plan.actions.some((item) => item.kind === 'conflict')).toBe(true);
  });
});
