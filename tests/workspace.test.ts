import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  addWorkspaceRoot,
  buildWorkspaceContext,
  createDecision,
  initLedger,
  initWorkspace,
  readWorkspace,
  readWorkspaceLedger,
  validateWorkspace,
  workspaceContextMarkdown,
  workspaceSummary,
} from '../src/core';

async function makeRoot(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-workspace-'));
}

describe('horizon workspace', () => {
  it('aggregates, searches, and validates decisions across roots', async () => {
    const first = await makeRoot();
    const second = await makeRoot();
    const workspaceRoot = await makeRoot();
    await initLedger(workspaceRoot);

    await createDecision(first, {
      title: 'Use SQLite for workspace storage',
      summary: 'SQLite keeps local data portable.',
      context: 'The workspace needs local-first storage.',
      decision: 'Use SQLite.',
      consequences: 'No hosted dependency.',
      scope: ['core/storage'],
      alternatives: [{ id: 'A-001', name: 'Postgres', verdict: 'rejected', reason: 'Too heavy locally.' }],
      evidence: [{ id: 'E-001', type: 'file', value: 'src/core/index.ts', strength: 'strong' }],
    });
    await createDecision(second, {
      id: 'D-0002',
      title: 'Keep evidence close to code',
      summary: 'Evidence should be verifiable from the repository.',
      context: 'Agents need deterministic context.',
      decision: 'Store file evidence in each root.',
      consequences: 'Auditors can verify provenance.',
      scope: ['tools/evidence'],
      alternatives: [{ id: 'A-001', name: 'Remote database', verdict: 'rejected', reason: 'Weak provenance.' }],
      evidence: [{ id: 'E-001', type: 'file', value: 'src/core/workspace.ts', strength: 'moderate' }],
    });

    await initWorkspace(workspaceRoot);
    await addWorkspaceRoot(workspaceRoot, first, 'first');
    await addWorkspaceRoot(workspaceRoot, second, 'second');
    const config = await readWorkspace(workspaceRoot);
    const entries = await readWorkspaceLedger(workspaceRoot, config);
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((entry) => entry.rootName))).toEqual(new Set(['second', 'first']));

    const summary = workspaceSummary(entries, config);
    expect(summary.decisions).toBe(2);
    expect(summary.roots.find((root) => root.name === 'first')?.decisions).toBe(1);

    const context = await buildWorkspaceContext(workspaceRoot, 'SQLite evidence');
    expect(context.decisions.map((hit) => hit.decision.id)).toContain('D-0001');
    expect(context.decisions.every((hit) => hit.rootName.length > 0)).toBe(true);
    expect(workspaceContextMarkdown(context)).toContain('[first] D-0001');

    const validation = await validateWorkspace(workspaceRoot);
    expect(validation.decisions).toBe(2);
    expect(validation.diagnostics.some((diagnostic) => diagnostic.level === 'error')).toBe(false);
  });

  it('detects duplicate IDs and contradictory verdicts across roots', async () => {
    const first = await makeRoot();
    const second = await makeRoot();
    const workspaceRoot = await makeRoot();
    await initLedger(workspaceRoot);
    await initWorkspace(workspaceRoot);

    await createDecision(first, {
      id: 'D-0001',
      title: 'Adopt SQLite',
      summary: 'SQLite is local.',
      context: 'Local storage is required.',
      decision: 'Use SQLite.',
      consequences: 'Data stays local.',
      scope: ['core'],
      alternatives: [{ id: 'A-001', name: 'SQLite', verdict: 'accepted' }],
    });
    await createDecision(second, {
      id: 'D-0001',
      title: 'Reject SQLite',
      summary: 'SQLite does not fit.',
      context: 'A hosted store is required.',
      decision: 'Use hosted storage.',
      consequences: 'Data is remote.',
      scope: ['core'],
      alternatives: [{ id: 'A-001', name: 'SQLite', verdict: 'rejected' }],
    });
    await addWorkspaceRoot(workspaceRoot, first, 'first');
    await addWorkspaceRoot(workspaceRoot, second, 'second');

    const validation = await validateWorkspace(workspaceRoot);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.some((item) => item.message.includes('duplicated across'))).toBe(true);
    const context = await buildWorkspaceContext(workspaceRoot, 'SQLite');
    expect(context.conflicts.some((conflict) => conflict.kind === 'contradictory_verdict')).toBe(true);
  });

  it('reports a missing enabled workspace root', async () => {
    const root = await makeRoot();
    const missing = await makeRoot();
    await initLedger(missing);
    await initLedger(root);
    await initWorkspace(root);
    await addWorkspaceRoot(root, missing, 'missing');
    const config = await readWorkspace(root);
    await fs.rm(missing, { recursive: true, force: true });

    const validation = await validateWorkspace(root, config);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.some((diagnostic) => diagnostic.message.includes('cannot be read'))).toBe(true);
  });
});




