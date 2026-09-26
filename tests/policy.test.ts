import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildChangeGate, createDecision, initLedger, validateLedger } from '../src/core';

import type { Decision } from '../src/core/types';

async function makeRoot(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-policy-'));
}

async function createRootWithDecision(options: {
  mode: 'observe' | 'review' | 'block';
  status: 'draft' | 'decided';
  requireEvidence: 'any' | 'verified' | 'strong' | 'sealed';
  seal?: boolean;
  strength?: 'strong' | 'moderate' | 'weak';
}): Promise<string> {
  const root = await makeRoot();
  await initLedger(root);
  await fs.mkdir(path.join(root, 'src/core'), { recursive: true });
  const target = path.join(root, 'src/core/index.ts');
  await fs.writeFile(target, 'export {};', 'utf8');
  const hash = options.seal
    ? createHash('sha256').update(await fs.readFile(target)).digest('hex')
    : undefined;
  await createDecision(root, {
    title: 'Use SQLite for local storage',
    summary: 'SQLite keeps local data portable.',
    context: 'Local-first storage is required.',
    decision: 'Use SQLite.',
    consequences: 'Data remains portable.',
    status: options.status,
    scope: ['src/core'],
    policy: { mode: options.mode, requireEvidence: options.requireEvidence },
    alternatives: [{ id: 'A-001', name: 'Postgres', verdict: 'rejected', reason: 'Too heavy locally.' }],
    evidence: options.strength ? [{ id: 'E-001', type: 'file', value: 'src/core/index.ts', strength: options.strength, hash }] : [],
  });
  return root;
}

describe('change gate', () => {
  it('blocks undecided governed changes', async () => {
    const root = await createRootWithDecision({ mode: 'block', status: 'draft', requireEvidence: 'verified' });
    const gate = await buildChangeGate(root, ['src/core/storage.ts']);
    expect(gate.verdict).toBe('block');
    expect(gate.violations.some((item) => item.message.includes('not decided'))).toBe(true);
  });

  it('passes verified evidence', async () => {
    const root = await createRootWithDecision({ mode: 'block', status: 'decided', requireEvidence: 'verified', strength: 'moderate' });
    const gate = await buildChangeGate(root, ['src/core/storage.ts']);
    expect(gate.verdict).toBe('pass');
    expect(gate.coverage.governed).toBe(1);
  });

  it('warns in review mode', async () => {
    const root = await createRootWithDecision({ mode: 'review', status: 'draft', requireEvidence: 'verified' });
    const gate = await buildChangeGate(root, ['src/core/storage.ts']);
    expect(gate.verdict).toBe('warn');
    expect(gate.violations.every((item) => item.level === 'warn')).toBe(true);
  });

  it('blocks any-evidence policy when no evidence is attached', async () => {
    const root = await createRootWithDecision({ mode: 'block', status: 'decided', requireEvidence: 'any' });
    const gate = await buildChangeGate(root, ['src/core/storage.ts']);
    expect(gate.verdict).toBe('block');
    expect(gate.violations.some((item) => item.message.includes('no attached evidence'))).toBe(true);
  });

  it('reports invalid policy metadata as errors', () => {
    const diagnostics = validateLedger([
      {
        id: 'D-0001',
        title: 'Invalid policy',
        status: 'decided',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        policy: { mode: 'error', requireEvidence: 'maybe' },
      } as Decision,
    ]);
    expect(diagnostics.some((item) => item.level === 'error' && item.message.includes('invalid policy mode'))).toBe(true);
    expect(diagnostics.some((item) => item.level === 'error' && item.message.includes('invalid policy evidence requirement'))).toBe(true);
  });

  it('passes sealed file evidence', async () => {
    const root = await createRootWithDecision({
      mode: 'block',
      status: 'decided',
      requireEvidence: 'sealed',
      strength: 'moderate',
      seal: true,
    });
    const gate = await buildChangeGate(root, ['src/core/storage.ts']);
    expect(gate.verdict).toBe('pass');
    expect(gate.audit.sealed).toBe(1);
  });

  it('blocks sealed evidence when the target drifts', async () => {
    const root = await createRootWithDecision({
      mode: 'block',
      status: 'decided',
      requireEvidence: 'sealed',
      strength: 'moderate',
      seal: true,
    });
    await fs.appendFile(path.join(root, 'src/core/index.ts'), '// drifted');
    const gate = await buildChangeGate(root, ['src/core/storage.ts']);
    expect(gate.verdict).toBe('block');
    expect(gate.violations.some((item) => item.message.includes('no sealed evidence'))).toBe(true);
    expect(gate.audit.findings.some((item) => item.status === 'missing' && item.message.includes('sha256 mismatch'))).toBe(true);
  });

  it('requires strong evidence when requested', async () => {
    const root = await createRootWithDecision({ mode: 'block', status: 'decided', requireEvidence: 'strong', strength: 'moderate' });
    const weak = await buildChangeGate(root, ['src/core/storage.ts']);
    expect(weak.verdict).toBe('block');
  });
});
