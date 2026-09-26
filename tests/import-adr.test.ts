import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importAdrDirectory, readLedger, validateLedger } from '../src/core';

describe('ADR import', () => {
  it('imports existing ADR Markdown without duplicating it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-import-root-'));
    const source = path.join(root, 'docs', 'adr');
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, '0001-use-sqlite.md'), `# 1. Use SQLite\n\n## Status\n\nAccepted\n\n## Context\n\nNeed a local store.\n\n## Decision\n\nUse SQLite.\n\n## Consequences\n\nSimple setup.\n\n## Considered Options\n\n- **JSON files**: No concurrent writer.\n`, 'utf8');

    const preview = await importAdrDirectory(root, source, { dryRun: true });
    expect(preview.scanned).toBe(1);
    expect(preview.results[0].action).toBe('dry-run');
    expect((await readLedger(root)).length).toBe(0);

    const report = await importAdrDirectory(root, source);
    expect(report.created).toBe(1);
    const ledger = await readLedger(root);
    expect(ledger.length).toBe(1);
    expect(ledger[0].title).toBe('1. Use SQLite');
    expect(ledger[0].status).toBe('decided');
    expect(ledger[0].alternatives?.[0].name).toBe('JSON files');
    expect(ledger[0].evidence?.some((item) => item.value === 'docs/adr/0001-use-sqlite.md')).toBe(true);

    const repeat = await importAdrDirectory(root, source);
    expect(repeat.created).toBe(0);
    expect(repeat.skipped).toBe(1);
    expect(validateLedger(ledger).some((item) => item.level === 'error')).toBe(false);
  });
});
