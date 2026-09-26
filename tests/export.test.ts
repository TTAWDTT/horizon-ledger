import { describe, expect, it } from 'bun:test';
import { exportLedger, exportMarkdown } from '../src/core/export';

describe('export', () => {
  it('exports ledger as JSON and Markdown', () => {
    const ledger = [
      {
        id: 'D-0001',
        title: 'Use SQLite',
        status: 'decided',
        createdAt: '',
        updatedAt: '',
        summary: 'Simple local store.',
        decision: 'Use SQLite.',
        consequences: 'Simple setup.',
        alternatives: [{ id: 'A', name: 'SQLite', verdict: 'accepted' }],
        evidence: [{ id: 'E-001', type: 'link', value: 'https://example.com', strength: 'strong' }],
        scope: ['src/core'],
        tags: ['storage'],
      },
    ] as any;
    const json = exportLedger(ledger);
    expect(json.version).toBe(1);
    expect(json.ledger.length).toBe(1);
    expect(json.scores[0].score.score).toBeGreaterThan(0);
    const md = exportMarkdown(ledger);
    expect(md).toContain('D-0001');
    expect(md).toContain('Use SQLite');
  });
});
