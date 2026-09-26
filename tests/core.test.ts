import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDecision, readLedger, addEvidence, validateLedger } from '../src/core';

describe('horizon ledger', () => {
  it('creates, reads, and searches decisions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-test-'));
    const created = await createDecision(root, {
      title: 'Use SQLite for local storage',
      summary: 'SQLite is simple and portable.',
      context: 'Need a local-first store with strong consistency.',
      decision: 'Use SQLite.',
      consequences: 'Simple local setup.',
      tags: ['storage', 'sqlite'],
      scope: ['core'],
    });
    expect(created.id).toBe('D-0001');
    const ledger = await readLedger(root);
    expect(ledger.length).toBe(1);
    expect(ledger[0].summary).toContain('SQLite');
    await addEvidence(root, created.id, { type: 'link', value: 'https://example.com', note: 'docs' });
    const updated = await readLedger(root);
    expect(updated[0].evidence?.length).toBe(1);
    expect(validateLedger(updated).some((d) => d.level === 'error')).toBe(false);
  });
});
