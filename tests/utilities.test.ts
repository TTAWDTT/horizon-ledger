import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildGraph, scoreDecision, searchLedger, decisionsForFile, validateLedger } from '../src/core';

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
});
