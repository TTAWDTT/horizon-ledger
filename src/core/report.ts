import { createHash } from 'node:crypto';
import path from 'node:path';
import { HORIZON_VERSION } from '../version';

export const GATE_REPORT_KIND = 'horizon.policy-gate-report';

export interface GateReportContext {
  root: string;
  base?: string;
  head?: string;
  workspace?: boolean;
}

export interface GateReport {
  kind: typeof GATE_REPORT_KIND;
  schemaVersion: 1;
  reportId: string;
  producer: { name: 'horizon-ledger'; version: string };
  createdAt: string;
  context: Required<GateReportContext>;
  gateDigest: string;
  gate: unknown;
}

export interface GateReportInput {
  root: string;
  base?: string;
  head?: string;
  workspace?: boolean;
  gate: unknown;
}

type Payload = Omit<GateReport, 'reportId'>;

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function gateDigestFor(gate: unknown): string {
  return `sha256:${sha256(stableStringify(gate))}`;
}

export function createGateReport(input: GateReportInput): GateReport {
  if (!input.gate || typeof input.gate !== 'object' || Array.isArray(input.gate)) {
    throw new Error('Gate report requires a structured gate result');
  }

  const payload: Payload = {
    kind: GATE_REPORT_KIND,
    schemaVersion: 1,
    producer: { name: 'horizon-ledger', version: HORIZON_VERSION },
    createdAt: new Date().toISOString(),
    context: {
      root: path.resolve(input.root),
      base: input.base ?? '',
      head: input.head ?? 'HEAD',
      workspace: input.workspace ?? false,
    },
    gateDigest: gateDigestFor(input.gate),
    gate: input.gate,
  };
  return { ...payload, reportId: `sha256:${sha256(stableStringify(payload))}` };
}

export function parseGateReport(raw: string): GateReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid Horizon gate report: invalid JSON: ${(error as Error).message}`);
  }

  const candidate = parsed as Partial<GateReport>;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Invalid Horizon gate report: expected a JSON object');
  }
  if (candidate.kind !== GATE_REPORT_KIND) {
    throw new Error(`Invalid Horizon gate report: expected kind ${GATE_REPORT_KIND}`);
  }
  if (candidate.schemaVersion !== 1) {
    throw new Error('Invalid Horizon gate report: expected schemaVersion 1');
  }
  if (typeof candidate.reportId !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(candidate.reportId)) {
    throw new Error('Invalid Horizon gate report: invalid report id');
  }
  if (typeof candidate.createdAt !== 'string') {
    throw new Error('Invalid Horizon gate report: missing createdAt');
  }
  if (!candidate.producer || typeof candidate.producer !== 'object' || candidate.producer.name !== 'horizon-ledger') {
    throw new Error('Invalid Horizon gate report: invalid producer');
  }
  if (!candidate.context || typeof candidate.context !== 'object') {
    throw new Error('Invalid Horizon gate report: missing context');
  }
  const context = candidate.context as Partial<GateReportContext>;
  if (typeof context.root !== 'string' || typeof context.base !== 'string' || typeof context.head !== 'string' || typeof context.workspace !== 'boolean') {
    throw new Error('Invalid Horizon gate report: invalid context');
  }
  if (typeof candidate.gateDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(candidate.gateDigest)) {
    throw new Error('Invalid Horizon gate report: invalid gate digest');
  }
  if (!candidate.gate || typeof candidate.gate !== 'object' || Array.isArray(candidate.gate)) {
    throw new Error('Invalid Horizon gate report: missing gate');
  }

  const expectedGateDigest = gateDigestFor(candidate.gate);
  if (candidate.gateDigest !== expectedGateDigest) {
    throw new Error('Invalid Horizon gate report: gate digest mismatch');
  }
  const { reportId, ...payload } = candidate as GateReport;
  const expectedReportId = `sha256:${sha256(stableStringify(payload))}`;
  if (reportId !== expectedReportId) {
    throw new Error('Invalid Horizon gate report: report id mismatch');
  }
  return candidate as GateReport;
}



export type GateReportVerdict = 'pass' | 'warn' | 'block';

export interface GateReportExpectations {
  reportId?: string;
  gateDigest?: string;
  verdict?: GateReportVerdict;
}

export interface GateReportVerification {
  ok: true;
  reportId: string;
  gateDigest: string;
  verdict: GateReportVerdict;
  producer: GateReport['producer'];
  context: GateReport['context'];
  files: unknown;
  coverage: unknown;
  violations: unknown;
}

export function verifyGateReport(
  raw: string,
  expectations: GateReportExpectations = {},
): GateReportVerification {
  const report = parseGateReport(raw);
  const gate = report.gate as { verdict?: unknown; files?: unknown; coverage?: unknown; violations?: unknown };
  if (gate.verdict !== 'pass' && gate.verdict !== 'warn' && gate.verdict !== 'block') {
    throw new Error('Invalid Horizon gate report: missing gate verdict');
  }
  if (expectations.reportId && expectations.reportId !== report.reportId) {
    throw new Error(`Horizon gate report id mismatch: expected ${expectations.reportId}, got ${report.reportId}`);
  }
  if (expectations.gateDigest && expectations.gateDigest !== report.gateDigest) {
    throw new Error(`Horizon gate digest mismatch: expected ${expectations.gateDigest}, got ${report.gateDigest}`);
  }
  if (expectations.verdict && expectations.verdict !== gate.verdict) {
    throw new Error(`Horizon gate verdict mismatch: expected ${expectations.verdict}, got ${gate.verdict}`);
  }
  return {
    ok: true,
    reportId: report.reportId,
    gateDigest: report.gateDigest,
    verdict: gate.verdict,
    producer: report.producer,
    context: report.context,
    files: gate.files,
    coverage: gate.coverage,
    violations: gate.violations,
  };
}
