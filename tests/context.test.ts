import { describe, expect, it } from 'bun:test';
import { buildContextBundleFromLedger, contextBundleMarkdown, estimateDecisionTokens } from '../src/core';

describe('decision context bundle', () => {
  it('builds a deterministic scope context for agents', async () => {
    const ledger = [
      {
        id: 'D-0001',
        title: 'Use SQLite',
        status: 'decided',
        createdAt: '',
        updatedAt: '',
        summary: 'Local and portable.',
        context: 'Need offline operation.',
        decision: 'Use SQLite.',
        consequences: 'Simple local setup.',
        scope: ['src/core'],
        alternatives: [{ id: 'A-001', name: 'Postgres', verdict: 'rejected', reason: 'Too heavy locally.' }],
        evidence: [{ id: 'E-001', type: 'file', value: 'src/core/context.ts', strength: 'strong' }],
      } as any,
    ];
    const bundle = await buildContextBundleFromLedger(ledger, process.cwd(), 'src/core/context.ts');
    expect(bundle.version).toBe(1);
    expect(bundle.queryKind).toBe('path');
    expect(bundle.decisions[0].id).toBe('D-0001');
    expect(bundle.audit.verified).toBe(1);
    expect(contextBundleMarkdown(bundle)).toContain('Use SQLite');
  });
});

describe('decision context packing', () => {
  it('omits whole decisions instead of truncating them', async () => {
    const ledger = [
      {
        id: 'D-0001',
        title: 'Use SQLite',
        status: 'decided',
        createdAt: '',
        updatedAt: '',
        summary: 'Local and portable.',
        decision: 'Use SQLite.',
        consequences: 'Simple local setup.',
        scope: ['src/core'],
        alternatives: [{ id: 'A-001', name: 'Postgres', verdict: 'rejected', reason: 'Too heavy.' }],
        evidence: [{ id: 'E-001', type: 'file', value: 'src/core/context.ts', strength: 'strong' }],
      } as any,
    ];
    const unlimited = await buildContextBundleFromLedger(ledger, process.cwd(), 'src/core/context.ts');
    expect(unlimited.packing.mode).toBe('unlimited');
    expect(unlimited.packing.estimatedTokens).toBeGreaterThan(0);

    const bundle = await buildContextBundleFromLedger(ledger, process.cwd(), 'src/core/context.ts', 10, 1);
    expect(bundle.decisions).toHaveLength(0);
    expect(bundle.packing.mode).toBe('budget');
    expect(bundle.packing.maxTokens).toBe(1);
    expect(bundle.packing.omitted[0].decisionId).toBe('D-0001');
    expect(bundle.packing.omitted[0].reason).toBe('budget');
    expect(contextBundleMarkdown(bundle)).toContain('Omitted by budget');
  });

  it('prefers blocking decisions when the budget is constrained', async () => {
    const blocking = {
      id: 'D-0001',
      title: 'Keep credentials out of source',
      status: 'decided',
      createdAt: '',
      updatedAt: '',
      summary: 'Credentials belong outside Git.',
      decision: 'Never commit credentials.',
      consequences: 'Secret rotation is required after leaks.',
      scope: ['src'],
      policy: { mode: 'block', requireEvidence: 'any' },
      alternatives: [{ id: 'A-001', name: 'Commit .env', verdict: 'rejected', reason: 'Leak risk.' }],
      evidence: [{ id: 'E-001', type: 'file', value: 'src', strength: 'strong' }],
    } as any;
    const observed = {
      id: 'D-0002',
      title: 'Prefer SQLite',
      status: 'decided',
      createdAt: '',
      updatedAt: '',
      summary: 'SQLite is local.',
      decision: 'Use SQLite.',
      consequences: 'Data stays portable.',
      scope: ['src'],
      alternatives: [{ id: 'A-001', name: 'Postgres', verdict: 'deferred' }],
      evidence: [{ id: 'E-001', type: 'file', value: 'src', strength: 'strong' }],
    } as any;
    const ledger = [observed, blocking];
    const budget = estimateDecisionTokens(blocking);
    const bundle = await buildContextBundleFromLedger(ledger, process.cwd(), 'src/core', 10, budget);
    expect(bundle.decisions.map((decision) => decision.id)).toEqual(['D-0001']);
    expect(bundle.packing.omitted.map((item) => item.decisionId)).toEqual(['D-0002']);
  });
});
