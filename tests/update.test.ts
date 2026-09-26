import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDecision, updateDecision, readLedger } from '../src/core';

describe('update', () => {
  it('does not overwrite undefined fields', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-update-'));
    const created = await createDecision(root, {
      title: 'Original title',
      summary: 'Original summary',
      context: 'Original context',
      decision: 'Original decision',
      consequences: 'Original consequences',
    });
    await updateDecision(root, created.id, { title: 'Updated title' });
    const ledger = await readLedger(root);
    expect(ledger[0].title).toBe('Updated title');
    expect(ledger[0].summary).toContain('Original summary');
    expect(ledger[0].decision).toContain('Original decision');
  });
});
