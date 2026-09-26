import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildGraph, scoreDecision, searchLedger, decisionsForFile, validateLedger, findConflicts, createDecision, addAlternative, readLedger } from '../src/core';

describe('horizon ledger utilities', () => {
  it('builds a graph and scores decisions', async () => {
    const decision = {
      id: 'D-0001',
      title: 'Use SQLite',
      status: 'decided',
      createdAt: '',
      updatedAt: '',
      summary: 'Simple local store.',
      context: 'Need local-first storage.',
      decision: 'Use SQLite.',
      consequences: 'Simple setup.',
      alternatives: [{ id: 'A', name: 'SQLite', verdict: 'accepted' }],
      evidence: [{ id: 'E-001', type: 'link', value: 'https://example.com', strength: 'strong' }],
      scope: ['src/core'],
      tags: ['storage'],
      confidence: 'high',
    } as any;

    const graph = buildGraph([decision]);
    expect(graph.nodes.length).toBe(3);
    expect(graph.edges.length).toBe(2);
    const score = scoreDecision(decision);
    expect(score.score).toBe(11);
    expect(score.total).toBe(11);
    expect(searchLedger([decision], 'sqlite').length).toBe(1);
    expect(decisionsForFile([decision], 'src/core/storage.ts').length).toBe(1);
    expect(validateLedger([decision]).some((d) => d.level === 'error')).toBe(false);
  });

  it('detects contradictory accepted and rejected alternatives in overlapping scopes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-conflict-'));
    const first = await createDecision(root, {
      title: 'Use Postgres for storage',
      summary: 'Need relational integrity.',
      context: 'The service has complex relations.',
      decision: 'Use Postgres.',
      consequences: 'Strong consistency.',
      scope: ['src/core/storage'],
    });
    const second = await createDecision(root, {
      title: 'Use SQLite for storage',
      summary: 'Need a local-first store.',
      context: 'The tool must run without services.',
      decision: 'Use SQLite.',
      consequences: 'Simple local setup.',
      scope: ['src/core/storage/local'],
    });
    await addAlternative(root, first.id, { name: 'SQLite', verdict: 'rejected', reason: 'No concurrent writer.' });
    await addAlternative(root, second.id, { name: 'SQLite', verdict: 'accepted', reason: 'Best local fit.' });

    const ledger = await readLedger(root);
    const conflicts = findConflicts(ledger);
    expect(conflicts.some((item) => item.kind === 'contradictory_verdict' && item.subject === 'SQLite')).toBe(true);
    expect(validateLedger(ledger).some((item) => item.level === 'error')).toBe(true);
  });
});
