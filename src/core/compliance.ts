import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { exportWorkspacePack, parseWorkspacePack, type WorkspacePack } from './pack';
import { auditWorkspace, readWorkspace, type WorkspaceAuditFinding } from './workspace';
import { sha256Hex, sha256Id, stableStringify } from './hash';
import { HORIZON_VERSION } from '../version';
import { isAttributed, type EvidenceAuditStatus } from './audit';
import type { Decision, DecisionStatus } from './types';

export const COMPLIANCE_REPORT_KIND = 'horizon.compliance-report';
export const COMPLIANCE_REPORT_SCHEMA_VERSION = 1;
export const COMPLIANCE_IN_TOTO_STATEMENT_TYPE = 'https://in-toto.io/Statement/v1';
export const COMPLIANCE_PREDICATE_TYPE = 'https://horizon.dev/attestations/compliance/v1';
export const COMPLIANCE_WORKSPACE_PACK_MEDIA_TYPE = 'application/vnd.horizon.workspace-pack.v1+json';
export const COMPLIANCE_PROFILE_MEDIA_TYPE = 'application/vnd.horizon.compliance-profile.v1+json';

export type ComplianceEvidenceRequirement = 'any' | 'verified' | 'strong' | 'sealed' | 'attributed';
export type ComplianceControlStatus = 'pass' | 'fail';

export interface ComplianceProfile {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  framework?: string;
  description?: string;
  controls: ComplianceProfileControl[];
}

export interface ComplianceProfileControl {
  id: string;
  title: string;
  requirement?: string;
  requireStatus?: DecisionStatus;
  decisionIds?: string[];
  tags?: string[];
  scopes?: string[];
  roots?: string[];
  requireEvidence?: ComplianceEvidenceRequirement;
  minimumDecisions?: number;
}

export interface ComplianceEvidenceFinding extends WorkspaceAuditFinding {}

export interface ComplianceControlResult {
  id: string;
  title: string;
  requirement?: string;
  status: ComplianceControlStatus;
  decisionIds: string[];
  satisfiedDecisionIds: string[];
  findings: ComplianceEvidenceFinding[];
  reason?: string;
}

export interface ComplianceSummary {
  controls: number;
  passing: number;
  failing: number;
  coverage: number;
  decisions: number;
  evidence: {
    verified: number;
    missing: number;
    external: number;
    unverifiable: number;
    sealed: number;
    attributed: number;
  };
}

export interface ComplianceArtifact {
  name: string;
  mediaType: string;
  digest: { sha256: string };
  content: unknown;
}

export interface ComplianceStatement {
  _type: typeof COMPLIANCE_IN_TOTO_STATEMENT_TYPE;
  subject: Array<{ name: string; digest: { sha256: string } }>;
  predicateType: typeof COMPLIANCE_PREDICATE_TYPE;
  predicate: {
    workspace: { name: string; decisionCount: number };
    packId: string;
    profileId: string;
    profileName: string;
    profileVersion: string;
    framework: string;
    profileDigest: string;
    controls: number;
    summary: ComplianceSummary;
  };
}

export interface WorkspaceComplianceReport {
  kind: typeof COMPLIANCE_REPORT_KIND;
  schemaVersion: 1;
  reportId: string;
  producer: { name: 'horizon-ledger'; version: string };
  createdAt: string;
  workspace: { name: string; decisionCount: number };
  profile: {
    id: string;
    name: string;
    version: string;
    framework: string;
    profileDigest: string;
  };
  artifacts: [ComplianceArtifact, ComplianceArtifact];
  evidenceFindings: ComplianceEvidenceFinding[];
  controls: ComplianceControlResult[];
  summary: ComplianceSummary;
  statement: ComplianceStatement;
}

export interface WorkspaceComplianceInspection {
  reportId: string;
  createdAt: string;
  workspace: { name: string; decisionCount: number };
  profile: WorkspaceComplianceReport['profile'];
  packId: string;
  summary: ComplianceSummary;
  controls: ComplianceControlResult[];
  artifacts: Array<{ name: string; mediaType: string; sha256: string }>;
  statement: { type: string; predicateType: string; subjects: number };
}

export interface WorkspaceComplianceExpectations {
  reportId?: string;
  packId?: string;
  profileId?: string;
  profileDigest?: string;
  framework?: string;
  controls?: number;
  passing?: number;
  failing?: number;
}

export interface WorkspaceComplianceVerification extends WorkspaceComplianceInspection {
  ok: true;
}

const artifactNames = ['decision-pack.json', 'compliance-profile.json'] as const;
const artifactMediaTypes = [
  COMPLIANCE_WORKSPACE_PACK_MEDIA_TYPE,
  COMPLIANCE_PROFILE_MEDIA_TYPE,
] as const;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const requirementLevels: ComplianceEvidenceRequirement[] = ['any', 'verified', 'strong', 'sealed', 'attributed'];

function artifactDigest(content: unknown): string {
  return sha256Hex(stableStringify(content));
}

function asString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value;
}

function asOptionalString(value: unknown, message: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return asString(value, message);
}

function asStringArray(value: unknown, message: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(message);
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function asRequirement(value: unknown): ComplianceEvidenceRequirement {
  if (value === undefined || value === null) return 'verified';
  if (typeof value !== 'string' || !requirementLevels.includes(value as ComplianceEvidenceRequirement)) {
    throw new Error(`Invalid Horizon compliance profile: invalid requireEvidence: ${String(value)}`);
  }
  return value as ComplianceEvidenceRequirement;
}

function selectorHasControl(control: ComplianceProfileControl): boolean {
  return Boolean(
    control.decisionIds?.length
    || control.tags?.length
    || control.scopes?.length
    || control.roots?.length,
  );
}

export function parseComplianceProfile(raw: string, format: 'json' | 'yaml' = 'json'): ComplianceProfile {
  let parsed: unknown;
  try {
    parsed = format === 'yaml' ? parseYaml(raw) : JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid Horizon compliance profile: invalid ${format}: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid Horizon compliance profile: expected an object');
  }
  const candidate = parsed as Partial<ComplianceProfile>;
  if (candidate.schemaVersion !== 1) {
    throw new Error('Invalid Horizon compliance profile: expected schemaVersion 1');
  }
  const id = asString(candidate.id, 'Invalid Horizon compliance profile: missing id');
  const name = asString(candidate.name, 'Invalid Horizon compliance profile: missing name');
  const version = asString(candidate.version, 'Invalid Horizon compliance profile: missing version');
  const framework = asOptionalString(candidate.framework, 'Invalid Horizon compliance profile: invalid framework');
  const description = asOptionalString(candidate.description, 'Invalid Horizon compliance profile: invalid description');
  if (!Array.isArray(candidate.controls) || candidate.controls.length === 0) {
    throw new Error('Invalid Horizon compliance profile: expected at least one control');
  }
  const ids = new Set<string>();
  const controls = candidate.controls.map((input, index): ComplianceProfileControl => {
    if (!input || typeof input !== 'object') {
      throw new Error(`Invalid Horizon compliance profile: control ${index} is not an object`);
    }
    const value = input as Partial<ComplianceProfileControl>;
    const controlId = asString(value.id, `Invalid Horizon compliance profile: control ${index} missing id`);
    if (ids.has(controlId)) throw new Error(`Invalid Horizon compliance profile: duplicate control id ${controlId}`);
    ids.add(controlId);
    const title = asString(value.title, `Invalid Horizon compliance profile: control ${controlId} missing title`);
    const control: ComplianceProfileControl = {
      id: controlId,
      title,
      requirement: asOptionalString(value.requirement, `Invalid Horizon compliance profile: control ${controlId} invalid requirement`),
      requireStatus: value.requireStatus === undefined || value.requireStatus === null
        ? 'decided'
        : (['draft', 'proposed', 'decided', 'rejected', 'superseded'] as const).includes(value.requireStatus as any)
          ? value.requireStatus as DecisionStatus
          : (() => { throw new Error(`Invalid Horizon compliance profile: control ${controlId} invalid requireStatus`); })(),
      decisionIds: asStringArray(value.decisionIds, `Invalid Horizon compliance profile: control ${controlId} invalid decisionIds`),
      tags: asStringArray(value.tags, `Invalid Horizon compliance profile: control ${controlId} invalid tags`),
      scopes: asStringArray(value.scopes, `Invalid Horizon compliance profile: control ${controlId} invalid scopes`),
      roots: asStringArray(value.roots, `Invalid Horizon compliance profile: control ${controlId} invalid roots`),
      requireEvidence: asRequirement(value.requireEvidence),
      minimumDecisions: value.minimumDecisions === undefined || value.minimumDecisions === null
        ? undefined
        : value.minimumDecisions,
    };
    if (!selectorHasControl(control)) {
      throw new Error(`Invalid Horizon compliance profile: control ${controlId} needs decisions, tags, scopes, or roots`);
    }
    if (control.minimumDecisions !== undefined && (!Number.isInteger(control.minimumDecisions) || control.minimumDecisions < 1)) {
      throw new Error(`Invalid Horizon compliance profile: control ${controlId} minimumDecisions must be a positive integer`);
    }
    return control;
  });

  return {
    schemaVersion: 1,
    id,
    name,
    version,
    framework,
    description,
    controls,
  };
}

export function parseComplianceProfileFile(raw: string, file: string): ComplianceProfile {
  const format = /\.(ya?ml)$/iu.test(file) ? 'yaml' : 'json';
  return parseComplianceProfile(raw, format);
}

function normalized(value: string): string {
  return value.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '').toLowerCase();
}

function scopeMatches(controlScope: string, decisionScopes: string[]): boolean {
  const control = normalized(controlScope);
  return decisionScopes.some((scope) => {
    const decisionScope = normalized(scope);
    return decisionScope === control
      || decisionScope.startsWith(`${control}/`)
      || control.startsWith(`${decisionScope}/`);
  });
}

function selectedDecision(
  control: ComplianceProfileControl,
  entry: { rootId: string; rootName: string; rootPath: string; decision: Decision },
): boolean {
  const decision = entry.decision;
  if ((control.requireStatus ?? 'decided') !== decision.status) return false;
  if (control.roots?.length && !control.roots.some((root) => normalized(root) === normalized(entry.rootName))) return false;
  if (control.decisionIds?.length && control.decisionIds.includes(decision.id)) return true;
  if (control.tags?.length && control.tags.some((tag) => decision.tags?.includes(tag))) return true;
  if (control.scopes?.length && control.scopes.some((scope) => scopeMatches(scope, decision.scope ?? []))) return true;
  return false;
}

function evidenceSatisfies(
  decision: Decision,
  finding: ComplianceEvidenceFinding,
  requirement: ComplianceEvidenceRequirement,
): boolean {
  if (requirement === 'any') return true;
  if (finding.status !== 'verified') return false;
  if (requirement === 'verified') return true;
  if (requirement === 'sealed') return finding.sealed === true;
  if (requirement === 'attributed') return isAttributed(finding);
  if (requirement === 'strong') {
    const evidence = decision.evidence?.find((item) => item.id === finding.evidenceId);
    return evidence?.strength === 'strong';
  }
  return false;
}

function controlReason(
  control: ComplianceProfileControl,
  selected: Array<{ rootId: string; rootName: string; rootPath: string; decision: Decision }>,
  satisfied: string[],
): string | undefined {
  const requirement = control.requireEvidence ?? 'verified';
  const minimum = control.minimumDecisions ?? 1;
  const explicit = control.decisionIds ?? [];
  if (!selected.length) return 'No matching decided evidence-backed decision';
  if (explicit.length) {
    const missing = explicit.filter((id) => !satisfied.includes(id));
    if (missing.length) return `Missing or insufficient evidence for: ${missing.join(', ')}`;
    return undefined;
  }
  if (satisfied.length < minimum) return `Only ${satisfied.length} decision(s) satisfy the control; ${minimum} required`;
  return undefined;
}

export function evaluateComplianceControls(
  profile: ComplianceProfile,
  decisions: Array<{ rootId: string; rootName: string; rootPath: string; decision: Decision }>,
  findings: ComplianceEvidenceFinding[],
): ComplianceControlResult[] {
  return profile.controls.map((control) => {
    const selected = decisions.filter((entry) => selectedDecision(control, entry));
    const selectedIds = selected.map((entry) => entry.decision.id);
    const requirement = control.requireEvidence ?? 'verified';
    const minimum = control.minimumDecisions ?? 1;
    const satisfied = selected
      .filter((entry) => {
        const decisionFindings = findings.filter((finding) => finding.decisionId === entry.decision.id);
        return (entry.decision.evidence ?? []).some((evidence) => {
          const finding = decisionFindings.find((item) => item.evidenceId === evidence.id);
          return finding && evidenceSatisfies(entry.decision, finding, requirement);
        });
      })
      .map((entry) => entry.decision.id);
    const controlFindings = findings.filter((finding) => selectedIds.includes(finding.decisionId));
    const reason = controlReason(control, selected, satisfied);
    return {
      id: control.id,
      title: control.title,
      requirement: control.requirement,
      status: reason ? 'fail' : 'pass',
      decisionIds: selectedIds,
      satisfiedDecisionIds: satisfied,
      findings: controlFindings,
      reason,
    };
  });
}

function complianceSummary(
  controls: ComplianceControlResult[],
  decisionCount: number,
  findings: ComplianceEvidenceFinding[],
): ComplianceSummary {
  const passing = controls.filter((control) => control.status === 'pass').length;
  return {
    controls: controls.length,
    passing,
    failing: controls.length - passing,
    coverage: controls.length ? Math.round((passing / controls.length) * 100) : 100,
    decisions: decisionCount,
    evidence: {
      verified: findings.filter((finding) => finding.status === 'verified').length,
      missing: findings.filter((finding) => finding.status === 'missing').length,
      external: findings.filter((finding) => finding.status === 'external').length,
      unverifiable: findings.filter((finding) => finding.status === 'unverifiable').length,
      sealed: findings.filter((finding) => finding.sealed === true).length,
      attributed: findings.filter((finding) => isAttributed(finding)).length,
    },
  };
}

function createComplianceStatement(
  pack: WorkspacePack,
  profile: ComplianceProfile,
  controls: ComplianceControlResult[],
  summary: ComplianceSummary,
): ComplianceStatement {
  return {
    _type: COMPLIANCE_IN_TOTO_STATEMENT_TYPE,
    subject: [
      { name: artifactNames[0], digest: { sha256: artifactDigest(pack) } },
      { name: artifactNames[1], digest: { sha256: artifactDigest(profile) } },
    ],
    predicateType: COMPLIANCE_PREDICATE_TYPE,
    predicate: {
      workspace: pack.workspace,
      packId: pack.packId,
      profileId: profile.id,
      profileName: profile.name,
      profileVersion: profile.version,
      framework: profile.framework ?? 'custom',
      profileDigest: `sha256:${artifactDigest(profile)}`,
      controls: controls.length,
      summary,
    },
  };
}

export async function exportWorkspaceCompliance(
  root: string,
  profile: ComplianceProfile,
): Promise<WorkspaceComplianceReport> {
  const resolvedRoot = path.resolve(root);
  const workspace = await readWorkspace(resolvedRoot);
  if (!workspace) throw new Error(`No Horizon workspace found at ${resolvedRoot}`);

  const pack = await exportWorkspacePack(resolvedRoot, workspace);
  const audit = await auditWorkspace(resolvedRoot, workspace);
  const controls = evaluateComplianceControls(profile, pack.decisions, audit.findings);
  const summary = complianceSummary(controls, pack.workspace.decisionCount, audit.findings);
  const statement = createComplianceStatement(pack, profile, controls, summary);
  const profileArtifact = {
    name: artifactNames[1],
    mediaType: artifactMediaTypes[1],
    digest: { sha256: artifactDigest(profile) },
    content: profile,
  };
  const packArtifact = {
    name: artifactNames[0],
    mediaType: artifactMediaTypes[0],
    digest: { sha256: artifactDigest(pack) },
    content: pack,
  };
  const payload: Omit<WorkspaceComplianceReport, 'reportId'> = {
    kind: COMPLIANCE_REPORT_KIND,
    schemaVersion: 1 as const,
    producer: { name: 'horizon-ledger' as const, version: HORIZON_VERSION },
    createdAt: new Date().toISOString(),
    workspace: pack.workspace,
    profile: {
      id: profile.id,
      name: profile.name,
      version: profile.version,
      framework: profile.framework ?? 'custom',
      profileDigest: `sha256:${artifactDigest(profile)}`,
    },
    artifacts: [packArtifact, profileArtifact] as [ComplianceArtifact, ComplianceArtifact],
    evidenceFindings: audit.findings,
    controls,
    summary,
    statement,
  };
  return { ...payload, reportId: sha256Id(stableStringify(payload)) };
}

export function parseWorkspaceCompliance(raw: string): WorkspaceComplianceReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid Horizon compliance report: invalid JSON: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid Horizon compliance report: expected a JSON object');
  }
  const candidate = parsed as Partial<WorkspaceComplianceReport>;
  if (candidate.kind !== COMPLIANCE_REPORT_KIND) {
    throw new Error(`Invalid Horizon compliance report: expected kind ${COMPLIANCE_REPORT_KIND}`);
  }
  if (candidate.schemaVersion !== 1) {
    throw new Error('Invalid Horizon compliance report: expected schemaVersion 1');
  }
  if (typeof candidate.reportId !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(candidate.reportId)) {
    throw new Error('Invalid Horizon compliance report: invalid report id');
  }
  if (typeof candidate.createdAt !== 'string') {
    throw new Error('Invalid Horizon compliance report: missing createdAt');
  }
  if (!candidate.producer || candidate.producer.name !== 'horizon-ledger') {
    throw new Error('Invalid Horizon compliance report: invalid producer');
  }
  if (!candidate.workspace || typeof candidate.workspace.name !== 'string' || typeof candidate.workspace.decisionCount !== 'number') {
    throw new Error('Invalid Horizon compliance report: invalid workspace metadata');
  }
  if (!candidate.profile || typeof candidate.profile.id !== 'string') {
    throw new Error('Invalid Horizon compliance report: invalid profile metadata');
  }
  if (!Array.isArray(candidate.artifacts) || candidate.artifacts.length !== 2) {
    throw new Error('Invalid Horizon compliance report: expected two artifacts');
  }
  if (!Array.isArray(candidate.evidenceFindings)) {
    throw new Error('Invalid Horizon compliance report: missing evidence findings');
  }

  const { reportId, ...payload } = candidate as WorkspaceComplianceReport;
  const expectedReportId = sha256Id(stableStringify(payload));
  if (reportId !== expectedReportId) {
    throw new Error(`Invalid Horizon compliance report: report id mismatch (expected ${expectedReportId}, got ${reportId}).`);
  }

  for (const [index, artifact] of payload.artifacts.entries()) {
    const prefix = `Invalid Horizon compliance artifact ${artifact?.name ?? index}`;
    if (!artifact || artifact.name !== artifactNames[index]) {
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

  const pack = parseWorkspacePack(stableStringify(payload.artifacts[0].content));
  const profile = payload.artifacts[1].content as ComplianceProfile;
  if (pack.workspace.decisionCount !== payload.workspace.decisionCount) {
    throw new Error('Invalid Horizon compliance report: workspace decision count mismatch');
  }
  if (payload.profile.profileDigest !== `sha256:${artifactDigest(profile)}`) {
    throw new Error('Invalid Horizon compliance report: profile digest mismatch');
  }
  if (payload.profile.id !== profile.id || payload.profile.name !== profile.name || payload.profile.version !== profile.version || payload.profile.framework !== (profile.framework ?? 'custom')) {
    throw new Error('Invalid Horizon compliance report: profile metadata mismatch');
  }

  const statement = payload.statement;
  if (statement._type !== COMPLIANCE_IN_TOTO_STATEMENT_TYPE) {
    throw new Error('Invalid Horizon compliance report: invalid in-toto statement type');
  }
  if (statement.predicateType !== COMPLIANCE_PREDICATE_TYPE) {
    throw new Error('Invalid Horizon compliance report: invalid predicate type');
  }
  if (!Array.isArray(statement.subject) || statement.subject.length !== 2) {
    throw new Error('Invalid Horizon compliance report: expected two statement subjects');
  }
  for (const [index, subject] of statement.subject.entries()) {
    if (!subject || subject.name !== artifactNames[index] || subject.digest?.sha256 !== payload.artifacts[index].digest.sha256) {
      throw new Error(`Invalid Horizon compliance report: statement subject mismatch for ${artifactNames[index]}`);
    }
  }
  if (statement.predicate.workspace.name !== pack.workspace.name || statement.predicate.workspace.decisionCount !== pack.workspace.decisionCount) {
    throw new Error('Invalid Horizon compliance report: statement workspace mismatch');
  }
  if (statement.predicate.packId !== pack.packId) {
    throw new Error('Invalid Horizon compliance report: statement pack id mismatch');
  }
  if (statement.predicate.profileId !== profile.id
    || statement.predicate.profileName !== profile.name
    || statement.predicate.profileVersion !== profile.version
    || statement.predicate.framework !== (profile.framework ?? 'custom')
    || statement.predicate.profileDigest !== payload.profile.profileDigest) {
    throw new Error('Invalid Horizon compliance report: statement profile mismatch');
  }

  const controls = evaluateComplianceControls(profile, pack.decisions, payload.evidenceFindings);
  const summary = complianceSummary(controls, pack.workspace.decisionCount, payload.evidenceFindings);
  if (stableStringify(controls) !== stableStringify(payload.controls)) {
    throw new Error('Invalid Horizon compliance report: control evaluation mismatch');
  }
  if (stableStringify(summary) !== stableStringify(payload.summary)) {
    throw new Error('Invalid Horizon compliance report: summary mismatch');
  }
  if (stableStringify(statement.predicate.summary) !== stableStringify(summary)) {
    throw new Error('Invalid Horizon compliance report: statement summary mismatch');
  }
  if (statement.predicate.controls !== controls.length) {
    throw new Error('Invalid Horizon compliance report: statement control count mismatch');
  }
  return candidate as WorkspaceComplianceReport;
}

export function inspectWorkspaceCompliance(raw: string): WorkspaceComplianceInspection {
  const report = parseWorkspaceCompliance(raw);
  const pack = report.artifacts[0].content as WorkspacePack;
  return {
    reportId: report.reportId,
    createdAt: report.createdAt,
    workspace: report.workspace,
    profile: report.profile,
    packId: pack.packId,
    summary: report.summary,
    controls: report.controls,
    artifacts: report.artifacts.map((artifact) => ({
      name: artifact.name,
      mediaType: artifact.mediaType,
      sha256: artifact.digest.sha256,
    })),
    statement: {
      type: report.statement._type,
      predicateType: report.statement.predicateType,
      subjects: report.statement.subject.length,
    },
  };
}

export function verifyWorkspaceCompliance(
  raw: string,
  expectations: WorkspaceComplianceExpectations = {},
): WorkspaceComplianceVerification {
  const report = parseWorkspaceCompliance(raw);
  if (expectations.reportId && expectations.reportId !== report.reportId) {
    throw new Error(`Horizon compliance report id mismatch: expected ${expectations.reportId}, got ${report.reportId}`);
  }
  if (expectations.packId && expectations.packId !== report.statement.predicate.packId) {
    throw new Error(`Horizon compliance pack id mismatch: expected ${expectations.packId}, got ${report.statement.predicate.packId}`);
  }
  if (expectations.profileId && expectations.profileId !== report.profile.id) {
    throw new Error(`Horizon compliance profile id mismatch: expected ${expectations.profileId}, got ${report.profile.id}`);
  }
  if (expectations.profileDigest && expectations.profileDigest !== report.profile.profileDigest) {
    throw new Error(`Horizon compliance profile digest mismatch: expected ${expectations.profileDigest}, got ${report.profile.profileDigest}`);
  }
  if (expectations.framework && expectations.framework !== report.profile.framework) {
    throw new Error(`Horizon compliance framework mismatch: expected ${expectations.framework}, got ${report.profile.framework}`);
  }
  if (expectations.controls !== undefined && expectations.controls !== report.summary.controls) {
    throw new Error(`Horizon compliance control count mismatch: expected ${expectations.controls}, got ${report.summary.controls}`);
  }
  if (expectations.passing !== undefined && expectations.passing !== report.summary.passing) {
    throw new Error(`Horizon compliance passing control count mismatch: expected ${expectations.passing}, got ${report.summary.passing}`);
  }
  if (expectations.failing !== undefined && expectations.failing !== report.summary.failing) {
    throw new Error(`Horizon compliance failing control count mismatch: expected ${expectations.failing}, got ${report.summary.failing}`);
  }
  return { ...inspectWorkspaceCompliance(raw), ok: true };
}

export function workspaceComplianceMarkdown(report: WorkspaceComplianceReport): string {
  const lines = [
    '# Horizon compliance report',
    '',
    `Report ID: \`${report.reportId}\``,
    `Workspace: ${report.workspace.name}`,
    `Pack ID: \`${report.statement.predicate.packId}\``,
    `Profile: ${report.profile.name} (${report.profile.id})`,
    `Framework: ${report.profile.framework}`,
    `Controls: ${report.summary.passing}/${report.summary.controls} passing`,
    `Coverage: ${report.summary.coverage}%`,
    '',
  ];
  for (const control of report.controls) {
    lines.push(`## ${control.id}: ${control.title}`);
    lines.push('');
    lines.push(`Status: **${control.status.toUpperCase()}**`);
    lines.push(`Decisions: ${control.satisfiedDecisionIds.length}/${control.decisionIds.length}`);
    if (control.reason) lines.push(`Reason: ${control.reason}`);
    if (control.requirement) lines.push(`Requirement: ${control.requirement}`);
    lines.push('');
  }
  return lines.join('\n');
}

export type { EvidenceAuditStatus };
