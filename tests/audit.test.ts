import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { addEvidence, createDecision, initLedger, readLedger, auditLedger } from '../src/core';

describe('evidence audit', () => {
  it('verifies local files, hashes, and marks URLs external', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-audit-'));
    await initLedger(root);
    const decision = await createDecision(root, {
      title: 'Use a tested local store',
      summary: 'Evidence must be checkable.',
      context: 'Decisions should not point to vanished proof.',
      decision: 'Use a deterministic evidence audit.',
      consequences: 'Missing proof becomes visible before merge.',
      scope: ['src/core'],
    });
    const target = path.join(root, 'docs', 'proof.md');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'deterministic proof');
    const hash = createHash('sha256').update(await fs.readFile(target)).digest('hex');
    await addEvidence(root, decision.id, { type: 'doc', value: 'docs/proof.md', strength: 'strong' });
    await addEvidence(root, decision.id, { type: 'file', value: 'docs/proof.md', hash, strength: 'strong' });
    await addEvidence(root, decision.id, { type: 'link', value: 'https://example.com', strength: 'moderate' });
    await addEvidence(root, decision.id, { type: 'file', value: 'docs/missing.md', strength: 'weak' });

    const ledger = await readLedger(root);
    const audit = await auditLedger(ledger, root);
    expect(audit.verified).toBe(2);
    expect(audit.external).toBe(1);
    expect(audit.missing).toBe(1);
    expect(audit.findings.some((item) => item.evidenceId === 'E-002' && item.status === 'verified')).toBe(true);
    expect(audit.findings.some((item) => item.evidenceId === 'E-004' && item.status === 'missing')).toBe(true);
  });
});
