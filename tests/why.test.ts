import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDecision, readLedger, decisionsForFile, searchLedger } from '../src/core';

describe('why behavior', () => {
  it('finds decisions by scope and text', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-why-'));
    const decision = await createDecision(root, {
      title: 'Use SQLite for local storage',
      summary: 'SQLite is simple and portable.',
      context: 'Need a local-first store.',
      decision: 'Use SQLite.',
      consequences: 'Simple local setup.',
      scope: ['src/core'],
    });
    const ledger = await readLedger(root);
    expect(decisionsForFile(ledger, 'src/core/storage.ts')).toHaveLength(1);
    expect(searchLedger(ledger, 'sqlite')).toHaveLength(1);
    expect(decision.scope?.[0]).toBe('src/core');
  });
});
