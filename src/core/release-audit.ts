import path from 'node:path';
import { buildWorkspaceChangeGate, readWorkspace, type WorkspaceChangeGate } from './workspace';
import { exportWorkspacePack, parseWorkspacePack, type WorkspacePack } from './pack';
import { createGateReport, parseGateReport, type GateReport, type GateReportVerdict } from './report';
import { buildWorkspaceTrace, type WorkspaceTraceReport } from './workspace-trace';
import { sha256Hex, sha256Id, stableStringify } from './hash';
import { HORIZON_VERSION } from '../version';

export const RELEASE_AUDIT_KIND = 'horizon.release-audit';
export const RELEASE_AUDIT_SCHEMA_VERSION = 1;
export const RELEASE_AUDIT_IN_TOTO_STATEMENT_TYPE = 'https://in-toto.io/Statement/v1';
export const RELEASE_AUDIT_PREDICATE_TYPE = 'https://horizon.dev/attestations/release-audit/v1';
export const RELEASE_AUDIT_WORKSPACE_PACK_MEDIA_TYPE = 'application/vnd.horizon.workspace-pack.v1+json';
export const RELEASE_AUDIT_GATE_REPORT_MEDIA_TYPE = 'application/vnd.horizon.policy-gate-report.v1+json';
export const WORKSPACE_TRACE_MEDIA_TYPE = 'application/vnd.horizon.workspace-trace.v1+json';

export interface ReleaseAuditArtifact {
  name: string;
  mediaType: string;
  digest: { sha256: string };
  content: unknown;
}

export interface ReleaseAuditStatement {
  _type: typeof RELEASE_AUDIT_IN_TOTO_STATEMENT_TYPE;
  subject: Array<{ name: string; digest: { sha256: string } }>;
  predicateType: typeof RELEASE_AUDIT_PREDICATE_TYPE;
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
    trace: {
      commits: number;
      attributedCommits: number;
      unattributedCommits: number;
      decisions: number;
      decisionsWithCommits: number;
      roots: number;
      matchedRoots: number;
    };
  };
}

export interface WorkspaceReleaseAudit {
  kind: typeof RELEASE_AUDIT_KIND;
  schemaVersion: 1;
  releaseAuditId: string;
  producer: { name: 'horizon-ledger'; version: string };
  createdAt: string;
  workspace: { name: string; decisionCount: number };
  statement: ReleaseAuditStatement;
  artifacts: [ReleaseAuditArtifact, ReleaseAuditArtifact, ReleaseAuditArtifact];
}

export interface WorkspaceReleaseAuditInput {
  base?: string;
  head?: string;
  files?: string[];
}

export interface WorkspaceReleaseAuditInspection {
  releaseAuditId: string;
  createdAt: string;
  workspace: { name: string; decisionCount: number };
  packId: string;
  gateReportId: string;
  gateDigest: string;
  gateVerdict: GateReportVerdict;
  changedFiles: number;
  coverage: { governed: number; unguarded: number };
  trace: ReleaseAuditStatement['predicate']['trace'];
  artifacts: Array<{ name: string; mediaType: string; sha256: string }>;
  statement: { type: string; predicateType: string; subjects: number };
}

export interface WorkspaceReleaseAuditExpectations {
  releaseAuditId?: string;
  packId?: string;
  gateReportId?: string;
  gateDigest?: string;
  gateVerdict?: GateReportVerdict;
  traceCommits?: number;
  attributedCommits?: number;
  unattributedCommits?: number;
}

export interface WorkspaceReleaseAuditVerification extends WorkspaceReleaseAuditInspection {
  ok: true;
}

const artifactNames = ['decision-pack.json', 'gate-report.json', 'commit-trace.json'] as const;
const artifactMediaTypes = [
  RELEASE_AUDIT_WORKSPACE_PACK_MEDIA_TYPE,
  RELEASE_AUDIT_GATE_REPORT_MEDIA_TYPE,
  WORKSPACE_TRACE_MEDIA_TYPE,
] as const;
const sha256Pattern = /^[a-f0-9]{64}$/u;

function artifactDigest(content: unknown): string {
  return sha256Hex(stableStringify(content));
}

function asVerdict(value: unknown): GateReportVerdict {
  if (value !== 'pass' && value !== 'warn' && value !== 'block') {
    throw new Error('Invalid Horizon release audit: invalid gate verdict');
  }
  return value;
}

function traceSummary(trace: WorkspaceTraceReport): ReleaseAuditStatement['predicate']['trace'] {
  return {
    commits: trace.summary.commits,
    attributedCommits: trace.summary.attributedCommits,
    unattributedCommits: trace.summary.unattributedCommits,
    decisions: trace.summary.decisions,
    decisionsWithCommits: trace.summary.decisionsWithCommits,
    matchedRoots: trace.summary.matchedRoots,
    roots: trace.summary.roots,
  };
}

function createReleaseAuditStatement(
  pack: WorkspacePack,
  report: GateReport,
  trace: WorkspaceTraceReport,
): ReleaseAuditStatement {
  const gate = report.gate as WorkspaceChangeGate;
  if (gate.verdict !== 'pass' && gate.verdict !== 'warn' && gate.verdict !== 'block') {
    throw new Error('Release audit requires a structured gate verdict');
  }
  if (!gate.coverage || typeof gate.coverage.governed !== 'number' || typeof gate.coverage.unguarded !== 'number') {
    throw new Error('Release audit requires gate coverage');
  }
  if (!trace.summary || typeof trace.summary.commits !== 'number') {
    throw new Error('Release audit requires a structured commit trace');
  }

  return {
    _type: RELEASE_AUDIT_IN_TOTO_STATEMENT_TYPE,
    subject: [
      { name: artifactNames[0], digest: { sha256: artifactDigest(pack) } },
      { name: artifactNames[1], digest: { sha256: artifactDigest(report) } },
      { name: artifactNames[2], digest: { sha256: artifactDigest(trace) } },
    ],
    predicateType: RELEASE_AUDIT_PREDICATE_TYPE,
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
      trace: traceSummary(trace),
    },
  };
}

export async function exportWorkspaceReleaseAudit(
  root: string,
  input: WorkspaceReleaseAuditInput = {},
): Promise<WorkspaceReleaseAudit> {
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
  const trace = await buildWorkspaceTrace(resolvedRoot, base, head, {
    files: input.files?.length ? input.files : undefined,
  });
  const statement = createReleaseAuditStatement(pack, report, trace);

  const payload: Omit<WorkspaceReleaseAudit, 'releaseAuditId'> = {
    kind: RELEASE_AUDIT_KIND,
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
      {
        name: artifactNames[2],
        mediaType: artifactMediaTypes[2],
        digest: { sha256: artifactDigest(trace) },
        content: trace,
      },
    ] as [ReleaseAuditArtifact, ReleaseAuditArtifact, ReleaseAuditArtifact],
  };

  return {
    ...payload,
    releaseAuditId: sha256Id(stableStringify(payload)),
  };
}

export function parseWorkspaceReleaseAudit(raw: string): WorkspaceReleaseAudit {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid Horizon release audit: invalid JSON: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid Horizon release audit: expected a JSON object');
  }
  const candidate = parsed as Partial<WorkspaceReleaseAudit>;
  if (candidate.kind !== RELEASE_AUDIT_KIND) {
    throw new Error(`Invalid Horizon release audit: expected kind ${RELEASE_AUDIT_KIND}`);
  }
  if (candidate.schemaVersion !== 1) {
    throw new Error('Invalid Horizon release audit: expected schemaVersion 1');
  }
  if (typeof candidate.releaseAuditId !== 'string' || !sha256Pattern.test(candidate.releaseAuditId.replace(/^sha256:/u, ''))) {
    throw new Error('Invalid Horizon release audit: invalid release audit id');
  }
  if (typeof candidate.createdAt !== 'string') {
    throw new Error('Invalid Horizon release audit: missing createdAt');
  }
  if (!candidate.producer || typeof candidate.producer !== 'object' || candidate.producer.name !== 'horizon-ledger') {
    throw new Error('Invalid Horizon release audit: invalid producer');
  }
  if (!candidate.workspace || typeof candidate.workspace.name !== 'string' || typeof candidate.workspace.decisionCount !== 'number') {
    throw new Error('Invalid Horizon release audit: invalid workspace metadata');
  }
  if (!candidate.statement || candidate.statement._type !== RELEASE_AUDIT_IN_TOTO_STATEMENT_TYPE) {
    throw new Error('Invalid Horizon release audit: invalid in-toto statement type');
  }
  if (candidate.statement.predicateType !== RELEASE_AUDIT_PREDICATE_TYPE) {
    throw new Error('Invalid Horizon release audit: invalid predicate type');
  }
  if (!Array.isArray(candidate.statement.subject) || candidate.statement.subject.length !== 3) {
    throw new Error('Invalid Horizon release audit: expected three statement subjects');
  }
  if (!Array.isArray(candidate.artifacts) || candidate.artifacts.length !== 3) {
    throw new Error('Invalid Horizon release audit: expected three artifacts');
  }

  const { releaseAuditId, ...payload } = candidate as WorkspaceReleaseAudit;
  const expectedReleaseAuditId = sha256Id(stableStringify(payload));
  if (releaseAuditId !== expectedReleaseAuditId) {
    throw new Error(`Invalid Horizon release audit: release audit id mismatch (expected ${expectedReleaseAuditId}, got ${releaseAuditId}).`);
  }

  for (const [index, artifact] of payload.artifacts.entries()) {
    const prefix = `Invalid Horizon release audit artifact ${artifact?.name ?? index}`;
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
  const traceArtifact = payload.artifacts[2];
  const pack = parseWorkspacePack(stableStringify(packArtifact.content));
  const report = parseGateReport(stableStringify(reportArtifact.content));
  const trace = traceArtifact.content as WorkspaceTraceReport;
  const gate = report.gate as WorkspaceChangeGate;
  const verdict = asVerdict(gate.verdict);
  if (!gate.coverage || typeof gate.coverage.governed !== 'number' || typeof gate.coverage.unguarded !== 'number') {
    throw new Error('Invalid Horizon release audit: invalid gate coverage');
  }
  if (!trace.summary || typeof trace.summary.commits !== 'number' || typeof trace.summary.attributedCommits !== 'number' || typeof trace.summary.unattributedCommits !== 'number') {
    throw new Error('Invalid Horizon release audit: invalid trace summary');
  }
  if (trace.base !== report.context.base || trace.head !== report.context.head) {
    throw new Error('Invalid Horizon release audit: trace and gate context mismatch');
  }
  if (stableStringify(trace.files ?? []) !== stableStringify(gate.files ?? [])) {
    throw new Error('Invalid Horizon release audit: trace and gate changed-file mismatch');
  }

  const statement = payload.statement;
  for (const [index, subject] of statement.subject.entries()) {
    if (!subject || subject.name !== artifactNames[index] || subject.digest?.sha256 !== payload.artifacts[index].digest.sha256) {
      throw new Error(`Invalid Horizon release audit: statement subject mismatch for ${artifactNames[index]}`);
    }
  }

  const predicate = statement.predicate;
  if (predicate.packId !== pack.packId) throw new Error('Invalid Horizon release audit: statement pack id mismatch');
  if (predicate.gateReportId !== report.reportId) throw new Error('Invalid Horizon release audit: statement gate report id mismatch');
  if (predicate.gateDigest !== report.gateDigest) throw new Error('Invalid Horizon release audit: statement gate digest mismatch');
  if (predicate.gateVerdict !== verdict) throw new Error('Invalid Horizon release audit: statement gate verdict mismatch');
  if (predicate.workspace.name !== pack.workspace.name || predicate.workspace.decisionCount !== pack.workspace.decisionCount) {
    throw new Error('Invalid Horizon release audit: statement workspace mismatch');
  }
  if (predicate.context.base !== report.context.base || predicate.context.head !== report.context.head) {
    throw new Error('Invalid Horizon release audit: statement context mismatch');
  }
  if (!Array.isArray(predicate.context.changedFiles) || !Array.isArray(gate.files) || stableStringify(predicate.context.changedFiles) !== stableStringify(gate.files)) {
    throw new Error('Invalid Horizon release audit: statement changed-file metadata mismatch');
  }
  if (predicate.coverage.governed !== gate.coverage.governed || predicate.coverage.unguarded !== gate.coverage.unguarded) {
    throw new Error('Invalid Horizon release audit: statement coverage mismatch');
  }
  if (stableStringify(predicate.trace) !== stableStringify(traceSummary(trace))) {
    throw new Error('Invalid Horizon release audit: statement trace summary mismatch');
  }
  if (report.context.workspace !== true) {
    throw new Error('Invalid Horizon release audit: gate report is not a workspace report');
  }
  if (pack.workspace.decisionCount !== payload.workspace.decisionCount) {
    throw new Error('Invalid Horizon release audit: workspace decision count mismatch');
  }

  return candidate as WorkspaceReleaseAudit;
}

export function inspectWorkspaceReleaseAudit(raw: string): WorkspaceReleaseAuditInspection {
  const audit = parseWorkspaceReleaseAudit(raw);
  const reportArtifact = audit.artifacts.find((artifact) => artifact.name === artifactNames[1])!;
  const report = reportArtifact.content as GateReport;
  const gate = report.gate as WorkspaceChangeGate;
  return {
    releaseAuditId: audit.releaseAuditId,
    createdAt: audit.createdAt,
    workspace: audit.workspace,
    packId: audit.statement.predicate.packId,
    gateReportId: audit.statement.predicate.gateReportId,
    gateDigest: audit.statement.predicate.gateDigest,
    gateVerdict: audit.statement.predicate.gateVerdict,
    changedFiles: gate.files?.length ?? 0,
    coverage: audit.statement.predicate.coverage,
    trace: audit.statement.predicate.trace,
    artifacts: audit.artifacts.map((artifact) => ({
      name: artifact.name,
      mediaType: artifact.mediaType,
      sha256: artifact.digest.sha256,
    })),
    statement: {
      type: audit.statement._type,
      predicateType: audit.statement.predicateType,
      subjects: audit.statement.subject.length,
    },
  };
}

export function verifyWorkspaceReleaseAudit(
  raw: string,
  expectations: WorkspaceReleaseAuditExpectations = {},
): WorkspaceReleaseAuditVerification {
  const audit = parseWorkspaceReleaseAudit(raw);
  if (expectations.releaseAuditId && expectations.releaseAuditId !== audit.releaseAuditId) {
    throw new Error(`Horizon release audit id mismatch: expected ${expectations.releaseAuditId}, got ${audit.releaseAuditId}`);
  }
  if (expectations.packId && expectations.packId !== audit.statement.predicate.packId) {
    throw new Error(`Horizon release audit pack id mismatch: expected ${expectations.packId}, got ${audit.statement.predicate.packId}`);
  }
  if (expectations.gateReportId && expectations.gateReportId !== audit.statement.predicate.gateReportId) {
    throw new Error(`Horizon gate report id mismatch: expected ${expectations.gateReportId}, got ${audit.statement.predicate.gateReportId}`);
  }
  if (expectations.gateDigest && expectations.gateDigest !== audit.statement.predicate.gateDigest) {
    throw new Error(`Horizon gate digest mismatch: expected ${expectations.gateDigest}, got ${audit.statement.predicate.gateDigest}`);
  }
  if (expectations.gateVerdict && expectations.gateVerdict !== audit.statement.predicate.gateVerdict) {
    throw new Error(`Horizon gate verdict mismatch: expected ${expectations.gateVerdict}, got ${audit.statement.predicate.gateVerdict}`);
  }
  if (expectations.traceCommits !== undefined && expectations.traceCommits !== audit.statement.predicate.trace.commits) {
    throw new Error(`Horizon trace commit count mismatch: expected ${expectations.traceCommits}, got ${audit.statement.predicate.trace.commits}`);
  }
  if (expectations.attributedCommits !== undefined && expectations.attributedCommits !== audit.statement.predicate.trace.attributedCommits) {
    throw new Error(`Horizon attributed commit count mismatch: expected ${expectations.attributedCommits}, got ${audit.statement.predicate.trace.attributedCommits}`);
  }
  if (expectations.unattributedCommits !== undefined && expectations.unattributedCommits !== audit.statement.predicate.trace.unattributedCommits) {
    throw new Error(`Horizon unattributed commit count mismatch: expected ${expectations.unattributedCommits}, got ${audit.statement.predicate.trace.unattributedCommits}`);
  }

  return {
    ...inspectWorkspaceReleaseAudit(raw),
    ok: true,
  };
}

export function workspaceReleaseAuditMarkdown(audit: WorkspaceReleaseAudit): string {
  const predicate = audit.statement.predicate;
  const lines = [
    '# Horizon release audit',
    '',
    `Release audit ID: \`${audit.releaseAuditId}\``,
    `Workspace: ${audit.workspace.name}`,
    `Pack ID: \`${predicate.packId}\``,
    `Gate report ID: \`${predicate.gateReportId}\``,
    `Gate digest: \`${predicate.gateDigest}\``,
    `Verdict: **${predicate.gateVerdict.toUpperCase()}**`,
    `Changed paths: ${predicate.context.changedFiles.length}`,
    `Coverage: ${predicate.coverage.governed} governed, ${predicate.coverage.unguarded} unguarded`,
    `Commits: ${predicate.trace.commits}`,
    `Attributed commits: ${predicate.trace.attributedCommits}`,
    `Unattributed commits: ${predicate.trace.unattributedCommits}`,
    `Statement: \`${audit.statement._type}\``,
    `Predicate: \`${audit.statement.predicateType}\``,
    '',
  ];

  for (const artifact of audit.artifacts) {
    lines.push(`- ${artifact.name} (${artifact.mediaType}, sha256:${artifact.digest.sha256})`);
  }
  lines.push('');

  return lines.join('\n');
}
