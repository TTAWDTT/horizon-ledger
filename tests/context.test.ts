import { describe, expect, it } from 'bun:test';
import { buildContextBundleFromLedger, contextBundleMarkdown } from '../src/core';

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
