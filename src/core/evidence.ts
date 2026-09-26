import path from 'node:path';
import { buildWorkspaceChangeGate, readWorkspace, type WorkspaceChangeGate } from './workspace';
import { exportWorkspacePack, parseWorkspacePack, type WorkspacePack } from './pack';
import { createGateReport, parseGateReport, type GateReport, type GateReportVerdict } from './report';
import { sha256Hex, sha256Id, stableStringify } from './hash';
import { HORIZON_VERSION } from '../version';

export const EVIDENCE_PACK_KIND = 'horizon.evidence-pack';
export const EVIDENCE_PACK_SCHEMA_VERSION = 1;
export const IN_TOTO_STATEMENT_TYPE = 'https://in-toto.io/Statement/v1';
export const EVIDENCE_PACK_PREDICATE_TYPE = 'https://horizon.dev/attestations/decision-evidence/v1';
export const WORKSPACE_PACK_MEDIA_TYPE = 'application/vnd.horizon.workspace-pack.v1+json';
export const GATE_REPORT_MEDIA_TYPE = 'application/vnd.horizon.policy-gate-report.v1+json';

export interface EvidencePackArtifact {
  name: string;
  mediaType: string;
  digest: { sha256: string };
  content: unknown;
}

export interface EvidencePackStatement {
  _type: typeof IN_TOTO_STATEMENT_TYPE;
  subject: Array<{ name: string; digest: { sha256: string } }>;
  predicateType: typeof EVIDENCE_PACK_PREDICATE_TYPE;
  predicate: {
    workspace: { name: string; decisionCount: number };
    packId: string;
    gateReportId: string;
    gateDigest: string;
    gateVerdict: GateReportVerdict;
    context: {
      base: string;
      head: string;
      changedFiles: string[];
    };
    coverage: {
      governed: number;
      unguarded: number;
    };
  };
}

export interface WorkspaceEvidencePack {
  kind: typeof EVIDENCE_PACK_KIND;
  schemaVersion: 1;
  evidencePackId: string;
  producer: { name: 'horizon-ledger'; version: string };
  createdAt: string;
  workspace: { name: string; decisionCount: number };
  statement: EvidencePackStatement;
  artifacts: [EvidencePackArtifact, EvidencePackArtifact];
}

export interface WorkspaceEvidencePackInput {
  base?: string;
  head?: string;
  files?: string[];
}

export interface WorkspaceEvidencePackInspection {
  evidencePackId: string;
  createdAt: string;
  workspace: { name: string; decisionCount: number };
  packId: string;
  gateReportId: string;
  gateDigest: string;
  gateVerdict: GateReportVerdict;
  changedFiles: number;
  coverage: { governed: number; unguarded: number };
  artifacts: Array<{ name: string; mediaType: string; sha256: string }>;
  statement: { type: string; predicateType: string; subjects: number };
}

export interface WorkspaceEvidencePackExpectations {
  evidencePackId?: string;
  packId?: string;
  gateReportId?: string;
  gateDigest?: string;
  gateVerdict?: GateReportVerdict;
}

export interface WorkspaceEvidencePackVerification extends WorkspaceEvidencePackInspection {
  ok: true;
}

const artifactNames = ['decision-pack.json', 'gate-report.json'] as const;
const artifactMediaTypes = [WORKSPACE_PACK_MEDIA_TYPE, GATE_REPORT_MEDIA_TYPE] as const;
const sha256Pattern = /^[a-f0-9]{64}$/u;

function artifactDigest(content: unknown): string {
  return sha256Hex(stableStringify(content));
}

function asVerdict(value: unknown): GateReportVerdict {
  if (value !== 'pass' && value !== 'warn' && value !== 'block') {
    throw new Error('Invalid Horizon evidence package: invalid gate verdict');
  }
  return value;
}

function createEvidenceStatement(
  pack: WorkspacePack,
  report: GateReport,
): EvidencePackStatement {
  const gate = report.gate as WorkspaceChangeGate;
  if (gate.verdict !== 'pass' && gate.verdict !== 'warn' && gate.verdict !== 'block') {
    throw new Error('Evidence package requires a structured gate verdict');
  }
  if (!gate.coverage || typeof gate.coverage.governed !== 'number' || typeof gate.coverage.unguarded !== 'number') {
    throw new Error('Evidence package requires gate coverage');
  }

  return {
    _type: IN_TOTO_STATEMENT_TYPE,
    subject: [
      { name: artifactNames[0], digest: { sha256: artifactDigest(pack) } },
      { name: artifactNames[1], digest: { sha256: artifactDigest(report) } },
    ],
    predicateType: EVIDENCE_PACK_PREDICATE_TYPE,
    predicate: {
      workspace: pack.workspace,
      packId: pack.packId,
      gateReportId: report.reportId,
      gateDigest: report.gateDigest,
      gateVerdict: gate.verdict,
      context: {
        base: report.context.base,
        head: report.context.head,
        changedFiles: gate.files ?? [],
      },
      coverage: {
        governed: gate.coverage.governed,
        unguarded: gate.coverage.unguarded,
      },
    },
  };
}

export async function exportWorkspaceEvidencePack(
  root: string,
  input: WorkspaceEvidencePackInput = {},
): Promise<WorkspaceEvidencePack> {
  const resolvedRoot = path.resolve(root);
  const workspace = await readWorkspace(resolvedRoot);
  if (!workspace) throw new Error(`No Horizon workspace found at ${resolvedRoot}`);

  const base = input.base ?? 'HEAD~1';
  const head = input.head ?? 'HEAD';
  const pack = await exportWorkspacePack(resolvedRoot, workspace);
  const gate = await buildWorkspaceChangeGate(resolvedRoot, base, head, input.files);
  const report = createGateReport({
    root: resolvedRoot,
    base,
    head,
    workspace: true,
    gate,
  });
  const statement = createEvidenceStatement(pack, report);

  const payload: Omit<WorkspaceEvidencePack, 'evidencePackId'> = {
    kind: EVIDENCE_PACK_KIND,
    schemaVersion: 1 as const,
    producer: { name: 'horizon-ledger' as const, version: HORIZON_VERSION },
    createdAt: new Date().toISOString(),
    workspace: pack.workspace,
    statement,
    artifacts: [
      {
        name: artifactNames[0],
        mediaType: artifactMediaTypes[0],
        digest: { sha256: artifactDigest(pack) },
        content: pack,
      },
      {
        name: artifactNames[1],
        mediaType: artifactMediaTypes[1],
        digest: { sha256: artifactDigest(report) },
        content: report,
      },
    ] as [EvidencePackArtifact, EvidencePackArtifact],
  };

  return {
    ...payload,
    evidencePackId: sha256Id(stableStringify(payload)),
  };
}

export function parseWorkspaceEvidencePack(raw: string): WorkspaceEvidencePack {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid Horizon evidence package: invalid JSON: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid Horizon evidence package: expected a JSON object');
  }
  const candidate = parsed as Partial<WorkspaceEvidencePack>;
  if (candidate.kind !== EVIDENCE_PACK_KIND) {
    throw new Error(`Invalid Horizon evidence package: expected kind ${EVIDENCE_PACK_KIND}`);
  }
  if (candidate.schemaVersion !== 1) {
    throw new Error('Invalid Horizon evidence package: expected schemaVersion 1');
  }
  if (typeof candidate.evidencePackId !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(candidate.evidencePackId)) {
    throw new Error('Invalid Horizon evidence package: invalid evidence pack id');
  }
  if (typeof candidate.createdAt !== 'string') {
    throw new Error('Invalid Horizon evidence package: missing createdAt');
  }
  if (!candidate.producer || typeof candidate.producer !== 'object' || candidate.producer.name !== 'horizon-ledger') {
    throw new Error('Invalid Horizon evidence package: invalid producer');
  }
  if (!candidate.workspace || typeof candidate.workspace.name !== 'string' || typeof candidate.workspace.decisionCount !== 'number') {
    throw new Error('Invalid Horizon evidence package: invalid workspace metadata');
  }
  if (!candidate.statement || candidate.statement._type !== IN_TOTO_STATEMENT_TYPE) {
    throw new Error('Invalid Horizon evidence package: invalid in-toto statement type');
  }
  if (candidate.statement.predicateType !== EVIDENCE_PACK_PREDICATE_TYPE) {
    throw new Error('Invalid Horizon evidence package: invalid predicate type');
  }
  if (!Array.isArray(candidate.statement.subject) || candidate.statement.subject.length !== 2) {
    throw new Error('Invalid Horizon evidence package: expected two statement subjects');
  }
  if (!Array.isArray(candidate.artifacts) || candidate.artifacts.length !== 2) {
    throw new Error('Invalid Horizon evidence package: expected two artifacts');
  }

  const { evidencePackId, ...payload } = candidate as WorkspaceEvidencePack;
  const expectedEvidencePackId = sha256Id(stableStringify(payload));
  if (evidencePackId !== expectedEvidencePackId) {
    throw new Error(`Invalid Horizon evidence package: evidence pack id mismatch (expected ${expectedEvidencePackId}, got ${evidencePackId}).`);
  }

  for (const [index, artifact] of payload.artifacts.entries()) {
    const prefix = `Invalid Horizon evidence package artifact ${artifact?.name ?? index}`;
    if (!artifact || typeof artifact.name !== 'string' || artifact.name !== artifactNames[index]) {
      throw new Error(`${prefix}: expected ${artifactNames[index]}`);
    }
    if (artifact.mediaType !== artifactMediaTypes[index]) {
      throw new Error(`${prefix}: expected media type ${artifactMediaTypes[index]}`);
    }
    if (!artifact.digest || typeof artifact.digest.sha256 !== 'string' || !sha256Pattern.test(artifact.digest.sha256)) {
      throw new Error(`${prefix}: invalid sha256 digest`);
    }
    if (artifactDigest(artifact.content) !== artifact.digest.sha256) {
      throw new Error(`${prefix}: content digest mismatch`);
    }
  }

  const packArtifact = payload.artifacts[0];
  const reportArtifact = payload.artifacts[1];
  const pack = parseWorkspacePack(stableStringify(packArtifact.content));
  const report = parseGateReport(stableStringify(reportArtifact.content));
  const gate = report.gate as WorkspaceChangeGate;
  const verdict = asVerdict(gate.verdict);
  if (!gate.coverage || typeof gate.coverage.governed !== 'number' || typeof gate.coverage.unguarded !== 'number') {
    throw new Error('Invalid Horizon evidence package: invalid gate coverage');
  }

  const statement = payload.statement;
  for (const [index, subject] of statement.subject.entries()) {
    if (!subject || subject.name !== artifactNames[index] || subject.digest?.sha256 !== payload.artifacts[index].digest.sha256) {
      throw new Error(`Invalid Horizon evidence package: statement subject mismatch for ${artifactNames[index]}`);
    }
  }

  const predicate = statement.predicate;
  if (predicate.packId !== pack.packId) throw new Error('Invalid Horizon evidence package: statement pack id mismatch');
  if (predicate.gateReportId !== report.reportId) throw new Error('Invalid Horizon evidence package: statement gate report id mismatch');
  if (predicate.gateDigest !== report.gateDigest) throw new Error('Invalid Horizon evidence package: statement gate digest mismatch');
  if (predicate.gateVerdict !== verdict) throw new Error('Invalid Horizon evidence package: statement gate verdict mismatch');
  if (predicate.workspace.name !== pack.workspace.name || predicate.workspace.decisionCount !== pack.workspace.decisionCount) {
    throw new Error('Invalid Horizon evidence package: statement workspace mismatch');
  }
  if (predicate.context.base !== report.context.base || predicate.context.head !== report.context.head) {
    throw new Error('Invalid Horizon evidence package: statement context mismatch');
  }
  if (!Array.isArray(predicate.context.changedFiles) || !Array.isArray(gate.files) || stableStringify(predicate.context.changedFiles) !== stableStringify(gate.files)) {
    throw new Error('Invalid Horizon evidence package: statement changed-file metadata mismatch');
  }
  if (predicate.coverage.governed !== gate.coverage.governed || predicate.coverage.unguarded !== gate.coverage.unguarded) {
    throw new Error('Invalid Horizon evidence package: statement coverage mismatch');
  }
  if (report.context.workspace !== true) {
    throw new Error('Invalid Horizon evidence package: gate report is not a workspace report');
  }
  if (pack.workspace.decisionCount !== payload.workspace.decisionCount) {
    throw new Error('Invalid Horizon evidence package: workspace decision count mismatch');
  }

  return candidate as WorkspaceEvidencePack;
}

export function inspectWorkspaceEvidencePack(raw: string): WorkspaceEvidencePackInspection {
  const pack = parseWorkspaceEvidencePack(raw);
  const reportArtifact = pack.artifacts.find((artifact) => artifact.name === artifactNames[1])!;
  const report = reportArtifact.content as GateReport;
  const gate = report.gate as WorkspaceChangeGate;
  return {
    evidencePackId: pack.evidencePackId,
    createdAt: pack.createdAt,
    workspace: pack.workspace,
    packId: pack.statement.predicate.packId,
    gateReportId: pack.statement.predicate.gateReportId,
    gateDigest: pack.statement.predicate.gateDigest,
    gateVerdict: pack.statement.predicate.gateVerdict,
    changedFiles: gate.files?.length ?? 0,
    coverage: pack.statement.predicate.coverage,
    artifacts: pack.artifacts.map((artifact) => ({
      name: artifact.name,
      mediaType: artifact.mediaType,
      sha256: artifact.digest.sha256,
    })),
    statement: {
      type: pack.statement._type,
      predicateType: pack.statement.predicateType,
      subjects: pack.statement.subject.length,
    },
  };
}

export function verifyWorkspaceEvidencePack(
  raw: string,
  expectations: WorkspaceEvidencePackExpectations = {},
): WorkspaceEvidencePackVerification {
  const pack = parseWorkspaceEvidencePack(raw);
  if (expectations.evidencePackId && expectations.evidencePackId !== pack.evidencePackId) {
    throw new Error(`Horizon evidence pack id mismatch: expected ${expectations.evidencePackId}, got ${pack.evidencePackId}`);
  }
  if (expectations.packId && expectations.packId !== pack.statement.predicate.packId) {
    throw new Error(`Horizon evidence pack id mismatch: expected ${expectations.packId}, got ${pack.statement.predicate.packId}`);
  }
  if (expectations.gateReportId && expectations.gateReportId !== pack.statement.predicate.gateReportId) {
    throw new Error(`Horizon gate report id mismatch: expected ${expectations.gateReportId}, got ${pack.statement.predicate.gateReportId}`);
  }
  if (expectations.gateDigest && expectations.gateDigest !== pack.statement.predicate.gateDigest) {
    throw new Error(`Horizon gate digest mismatch: expected ${expectations.gateDigest}, got ${pack.statement.predicate.gateDigest}`);
  }
  if (expectations.gateVerdict && expectations.gateVerdict !== pack.statement.predicate.gateVerdict) {
    throw new Error(`Horizon gate verdict mismatch: expected ${expectations.gateVerdict}, got ${pack.statement.predicate.gateVerdict}`);
  }

  return {
    ...inspectWorkspaceEvidencePack(raw),
    ok: true,
  };
}

export function workspaceEvidencePackMarkdown(pack: WorkspaceEvidencePack): string {
  const predicate = pack.statement.predicate;
  const lines = [
    '# Horizon evidence package',
    '',
    `Evidence pack ID: \`${pack.evidencePackId}\``,
    `Workspace: ${pack.workspace.name}`,
    `Pack ID: \`${predicate.packId}\``,
    `Gate report ID: \`${predicate.gateReportId}\``,
    `Gate digest: \`${predicate.gateDigest}\``,
    `Verdict: **${predicate.gateVerdict.toUpperCase()}**`,
    `Changed paths: ${predicate.context.changedFiles.length}`,
    `Coverage: ${predicate.coverage.governed} governed, ${predicate.coverage.unguarded} unguarded`,
    `Statement: \`${pack.statement._type}\``,
    `Predicate: \`${pack.statement.predicateType}\``,
    '',
  ];

  for (const artifact of pack.artifacts) {
    lines.push(`- ${artifact.name} (${artifact.mediaType}, sha256:${artifact.digest.sha256})`);
  }
  lines.push('');

  return lines.join('\n');
}
