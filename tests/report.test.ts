import { describe, expect, it } from 'bun:test';
import { GATE_REPORT_KIND, createGateReport, gateDigestFor, parseGateReport } from '../src/core';

const gate = {
  version: 1,
  root: '/tmp/horizon-report',
  files: ['src/core/storage.ts'],
  decisions: [],
  coverage: { governed: 1, unguarded: 0 },
  conflicts: [],
  audit: { verified: 1, missing: 0, external: 0, unverifiable: 0, sealed: 0, findings: [] },
  diagnostics: [],
  violations: [],
  verdict: 'pass',
};

describe('gate report', () => {
  it('creates and verifies a hash-bound report', () => {
    const report = createGateReport({ root: '/tmp/horizon-report', base: 'main', head: 'HEAD', gate });
    expect(report.kind).toBe(GATE_REPORT_KIND);
    expect(report.reportId).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(report.gateDigest).toBe(gateDigestFor(gate));
    expect(parseGateReport(JSON.stringify(report)).reportId).toBe(report.reportId);
  });

  it('rejects tampered payloads', () => {
    const report = createGateReport({ root: '/tmp/horizon-report', base: 'main', head: 'HEAD', gate });
    const tampered = { ...report, gateDigest: 'sha256:0'.padEnd(71, '0') };
    expect(() => parseGateReport(JSON.stringify(tampered))).toThrow(/gate digest mismatch/u);

    const tamperedGate = structuredClone(report);
    tamperedGate.gate = { ...gate, verdict: 'warn' };
    expect(() => parseGateReport(JSON.stringify(tamperedGate))).toThrow(/gate digest mismatch/u);

    const tamperedEnvelope = structuredClone(report);
    tamperedEnvelope.context.base = 'other';
    expect(() => parseGateReport(JSON.stringify(tamperedEnvelope))).toThrow(/report id mismatch/u);
  });
});
