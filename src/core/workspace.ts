import fs from 'node:fs/promises';
import path from 'node:path';
import type { Decision } from './types';
import { readLedger } from './ledger';
import { decisionsForFile } from './relevance';
import { listChangedFiles } from './pr-context';
import { validateLedger, type Diagnostic } from './validate';
import { scoreDecision } from './score';
import { findConflicts, type ConflictDiagnostic } from './conflicts';
import { searchLedger } from './search';
import { auditLedger, type EvidenceAudit } from './audit';
import { buildChangeGate, type ChangeGate, type GateViolation, type GateVerdict } from './policy';
import { compareDecisionsForContext, estimateDecisionTokens, type ContextPacking } from './context';

export interface WorkspaceRootConfig {
  id: string;
  name: string;
  path: string;
  enabled?: boolean;
}

export interface WorkspaceConfig {
  version: 1;
  name: string;
  roots: WorkspaceRootConfig[];
}

export interface WorkspaceConfigIssue {
  path: string;
  message: string;
}

export class WorkspaceConfigError extends Error {
  readonly issues: WorkspaceConfigIssue[];

  constructor(issues: WorkspaceConfigIssue[], message = 'Invalid Horizon workspace configuration') {
    super([message, ...issues.map((issue) => `- ${issue.path}: ${issue.message}`)].join('\n'));
    this.name = 'WorkspaceConfigError';
    this.issues = issues;
  }
}

export interface WorkspaceDecision {
  rootId: string;
  rootName: string;
  rootPath: string;
  decision: Decision;
}

export interface WorkspaceRootSummary {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  decisions: number;
}

export interface WorkspaceSummary {
  name: string;
  roots: WorkspaceRootSummary[];
  decisions: number;
}

export interface WorkspaceDiagnostic {
  rootId?: string;
  rootName?: string;
  level: 'error' | 'warn';
  id?: string;
  message: string;
}

export interface WorkspaceSearchHit {
  rootId: string;
  rootName: string;
  rootPath: string;
  decision: Decision;
  relevance: number;
  reason: string;
}

export interface WorkspaceContext {
  version: 1;
  root: string;
  query: string;
  roots: WorkspaceRootSummary[];
  decisions: WorkspaceSearchHit[];
  conflicts: ConflictDiagnostic[];
  diagnostics: WorkspaceDiagnostic[];
  packing?: ContextPacking;
}

export interface WorkspaceAuditFinding extends EvidenceAudit {
  rootId: string;
  rootName: string;
  rootPath: string;
}

export interface WorkspacePullRequestDecision {
  rootId: string;
  rootName: string;
  rootPath: string;
  decision: Decision;
}

export interface WorkspacePullRequestAuditFinding extends EvidenceAudit {
  rootId: string;
  rootName: string;
}

export interface WorkspacePullRequestContext {
  version: 1;
  root: string;
  base: string;
  head: string;
  files: string[];
  decisions: WorkspacePullRequestDecision[];
  conflicts: ReturnType<typeof findConflicts>;
  audit: {
    verified: number;
    missing: number;
    external: number;
    unverifiable: number;
    findings: WorkspacePullRequestAuditFinding[];
  };
  diagnostics: WorkspaceDiagnostic[];
}

export interface WorkspaceGateViolation extends GateViolation {
  rootId: string;
  rootName: string;
  rootPath: string;
}

export interface WorkspaceRootGate {
  rootId: string;
  rootName: string;
  rootPath: string;
  files: string[];
  gate: ChangeGate;
}

export interface WorkspaceChangeGate {
  version: 1;
  root: string;
  base: string;
  head: string;
  files: string[];
  roots: WorkspaceRootConfig[];
  gates: WorkspaceRootGate[];
  decisions: WorkspacePullRequestDecision[];
  coverage: {
    governed: number;
    unguarded: number;
  };
  diagnostics: WorkspaceDiagnostic[];
  violations: WorkspaceGateViolation[];
  verdict: GateVerdict;
}

export interface WorkspaceExport {
  version: 1;
  name: string;
  roots: WorkspaceRootSummary[];
  decisions: WorkspaceDecision[];
  conflicts: ReturnType<typeof findConflicts>;
  diagnostics: WorkspaceDiagnostic[];
  audit: {
    verified: number;
    missing: number;
    external: number;
    unverifiable: number;
    findings: WorkspaceAuditFinding[];
  };
}
export interface WorkspaceAudit {
  name: string;
  roots: WorkspaceRootSummary[];
  decisions: number;
  verified: number;
  missing: number;
  external: number;
  unverifiable: number;
  findings: WorkspaceAuditFinding[];
  diagnostics: WorkspaceDiagnostic[];
  ok: boolean;
}
export interface WorkspaceValidation {
  name: string;
  roots: WorkspaceRootSummary[];
  decisions: number;
  diagnostics: WorkspaceDiagnostic[];
  ok: boolean;
}

export function workspaceConfigPath(root: string): string {
  return path.join(path.resolve(root), '.horizon', 'workspace.json');
}

export function parseWorkspaceConfig(raw: string, workspaceRoot?: string): WorkspaceConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new WorkspaceConfigError([{ path: '$', message: `Invalid JSON: ${(error as Error).message}` }]);
  }
  return validateWorkspaceConfig(parsed, workspaceRoot);
}

export function validateWorkspaceConfig(value: unknown, workspaceRoot?: string): WorkspaceConfig {
  const issues: WorkspaceConfigIssue[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WorkspaceConfigError([{ path: '$', message: 'Expected a workspace object' }]);
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) {
    issues.push({ path: '$.version', message: 'Expected version 1' });
  }
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
    issues.push({ path: '$.name', message: 'Expected a non-empty workspace name' });
  }
  if (!Array.isArray(candidate.roots)) {
    issues.push({ path: '$.roots', message: 'Expected an array of roots' });
  }
  if (issues.length) throw new WorkspaceConfigError(issues);

  const config: WorkspaceConfig = {
    version: 1,
    name: (candidate.name as string).trim(),
    roots: [],
  };
  const ids = new Map<string, number>();
  const names = new Map<string, number>();
  const paths = new Map<string, number>();

  (candidate.roots as unknown[]).forEach((item, index) => {
    const prefix = `$.roots[${index}]`;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      issues.push({ path: prefix, message: 'Expected a workspace root object' });
      return;
    }
    const root = item as Record<string, unknown>;

    if (typeof root.id !== 'string' || !/^r-0*[1-9][0-9]*$/u.test(root.id)) {
      issues.push({ path: `${prefix}.id`, message: 'Expected an id like r-001' });
    } else {
      const existing = ids.get(root.id);
      if (existing !== undefined) {
        issues.push({ path: `${prefix}.id`, message: `Duplicate root id: ${root.id}` });
      } else {
        ids.set(root.id, index);
      }
    }

    if (typeof root.name !== 'string' || !root.name.trim()) {
      issues.push({ path: `${prefix}.name`, message: 'Expected a non-empty root name' });
    } else {
      const name = root.name.trim();
      const existing = names.get(name.toLowerCase());
      if (existing !== undefined) {
        issues.push({ path: `${prefix}.name`, message: `Duplicate root name: ${name}` });
      } else {
        names.set(name.toLowerCase(), index);
      }
    }

    if (typeof root.path !== 'string' || !root.path.trim()) {
      issues.push({ path: `${prefix}.path`, message: 'Expected a non-empty root path' });
      return;
    }
    const rootPath = root.path.trim().replace(/\\/g, '/').replace(/\/+$/, '') || '.';
    if (rootPath.includes('\0')) {
      issues.push({ path: `${prefix}.path`, message: 'Root path cannot contain NUL characters' });
    }
    if (path.isAbsolute(rootPath)) {
      issues.push({ path: `${prefix}.path`, message: 'Use a path relative to the workspace' });
    }
    if (rootPath.split('/').includes('.horizon')) {
      issues.push({ path: `${prefix}.path`, message: 'Root path must be a ledger root, not a .horizon directory' });
    }

    const resolvedPath = path.resolve(workspaceRoot ?? process.cwd(), rootPath);
    const existing = paths.get(resolvedPath);
    if (existing !== undefined) {
      issues.push({ path: `${prefix}.path`, message: `Duplicate resolved root path: ${rootPath}` });
    } else {
      paths.set(resolvedPath, index);
    }

    if (root.enabled !== undefined && typeof root.enabled !== 'boolean') {
      issues.push({ path: `${prefix}.enabled`, message: 'Expected enabled to be a boolean' });
    }

    if (!issues.some((issue) => issue.path.startsWith(prefix))) {
      config.roots.push({
        id: root.id as string,
        name: (root.name as string).trim(),
        path: rootPath,
        enabled: root.enabled as boolean | undefined,
      });
    }
  });

  if (issues.length) throw new WorkspaceConfigError(issues);
  return config;
}

export async function readWorkspace(root: string): Promise<WorkspaceConfig | undefined> {
  try {
    const raw = await fs.readFile(workspaceConfigPath(root), 'utf8');
    return parseWorkspaceConfig(raw, root);
  } catch (error) {
    if (error instanceof WorkspaceConfigError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function writeWorkspace(root: string, config: WorkspaceConfig): Promise<void> {
  validateWorkspaceConfig(config, root);
  await fs.mkdir(path.join(path.resolve(root), '.horizon'), { recursive: true });
  await fs.writeFile(workspaceConfigPath(root), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export async function initWorkspace(root: string, name = 'Horizon Workspace'): Promise<WorkspaceConfig> {
  const existing = await readWorkspace(root);
  if (existing) return existing;
  const config: WorkspaceConfig = {
    version: 1,
    name,
    roots: [{
      id: 'r-001',
      name: path.basename(path.resolve(root)),
      path: '.',
      enabled: true,
    }],
  };
  await writeWorkspace(root, config);
  return config;
}

function relativeWorkspacePath(from: string, to: string): string {
  const relative = path.relative(path.resolve(from), path.resolve(to));
  return (relative || '.').replace(/\\/g, '/');
}

function nextWorkspaceRootId(config: WorkspaceConfig): string {
  const max = config.roots.reduce((value, root) => {
    const match = /^r-(\d+)$/u.exec(root.id);
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return `r-${String(max + 1).padStart(3, '0')}`;
}

export async function addWorkspaceRoot(
  workspaceRoot: string,
  target: string,
  name?: string,
): Promise<WorkspaceConfig> {
  const resolvedTarget = path.resolve(workspaceRoot, target);

  try {
    await fs.access(path.join(resolvedTarget, '.horizon'));
  } catch {
    throw new Error(`Not a Horizon ledger: ${resolvedTarget}`);
  }

  const config = await readWorkspace(workspaceRoot) ?? await initWorkspace(workspaceRoot);

  const rootName = name ?? path.basename(resolvedTarget);
  if (!rootName.trim()) throw new Error('Workspace root name cannot be empty.');
  if (config.roots.some((root) => root.name.trim().toLowerCase() === rootName.trim().toLowerCase())) {
    throw new Error(`Workspace root name already exists: ${rootName}`);
  }

  const rootPath = relativeWorkspacePath(workspaceRoot, resolvedTarget);
  const resolvedPath = path.resolve(workspaceRoot, rootPath);
  if (config.roots.some((root) => path.resolve(workspaceRoot, root.path) === resolvedPath)) {
    throw new Error(`Workspace root path already exists: ${rootPath}`);
  }

  config.roots.push({
    id: nextWorkspaceRootId(config),
    name: rootName,
    path: rootPath,
    enabled: true,
  });
  await writeWorkspace(workspaceRoot, config);
  return config;
}

function findWorkspaceRootIndex(
  workspaceRoot: string,
  config: WorkspaceConfig,
  identifier: string,
): number {
  const value = identifier.trim();
  if (!value) throw new Error('Workspace root identifier cannot be empty.');
  const byId = config.roots.findIndex((root) => root.id === value);
  if (byId !== -1) return byId;
  const byName = config.roots.findIndex((root) => root.name.trim().toLowerCase() === value.toLowerCase());
  if (byName !== -1) return byName;
  const target = path.resolve(workspaceRoot, value);
  const byPath = config.roots.findIndex((root) => path.resolve(workspaceRoot, root.path) === target);
  if (byPath !== -1) return byPath;
  throw new Error(`Workspace root not found: ${identifier}`);
}

export async function removeWorkspaceRoot(
  workspaceRoot: string,
  identifier: string,
): Promise<WorkspaceRootConfig> {
  const config = await readWorkspace(workspaceRoot);
  if (!config) throw new Error(`No Horizon workspace found at ${path.resolve(workspaceRoot)}`);
  const index = findWorkspaceRootIndex(workspaceRoot, config, identifier);
  const [removed] = config.roots.splice(index, 1);
  await writeWorkspace(workspaceRoot, config);
  return removed;
}

export async function setWorkspaceRootEnabled(
  workspaceRoot: string,
  identifier: string,
  enabled: boolean,
): Promise<WorkspaceConfig> {
  const config = await readWorkspace(workspaceRoot);
  if (!config) throw new Error(`No Horizon workspace found at ${path.resolve(workspaceRoot)}`);
  const index = findWorkspaceRootIndex(workspaceRoot, config, identifier);
  config.roots[index].enabled = enabled;
  await writeWorkspace(workspaceRoot, config);
  return config;
}

export function enableWorkspaceRoot(
  workspaceRoot: string,
  identifier: string,
): Promise<WorkspaceConfig> {
  return setWorkspaceRootEnabled(workspaceRoot, identifier, true);
}

export function disableWorkspaceRoot(
  workspaceRoot: string,
  identifier: string,
): Promise<WorkspaceConfig> {
  return setWorkspaceRootEnabled(workspaceRoot, identifier, false);
}

export async function readWorkspaceLedger(
  root: string,
  config?: WorkspaceConfig,
): Promise<WorkspaceDecision[]> {
  const workspace = config ?? await readWorkspace(root);
  if (!workspace) return [];

  const entries: WorkspaceDecision[] = [];
  for (const rootConfig of workspace.roots) {
    if (rootConfig.enabled === false) continue;
    const resolvedRoot = path.resolve(root, rootConfig.path);
    for (const decision of await readLedger(resolvedRoot)) {
      entries.push({
        rootId: rootConfig.id,
        rootName: rootConfig.name,
        rootPath: rootConfig.path,
        decision,
      });
    }
  }
  return entries;
}

export function workspaceRootSummaries(
  config: WorkspaceConfig,
  entries: WorkspaceDecision[],
): WorkspaceRootSummary[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.rootId, (counts.get(entry.rootId) ?? 0) + 1);
  }
  return config.roots.map((root) => ({
    id: root.id,
    name: root.name,
    path: root.path,
    enabled: root.enabled !== false,
    decisions: counts.get(root.id) ?? 0,
  }));
}

export async function getWorkspaceDecision(
  root: string,
  id: string,
  config?: WorkspaceConfig,
): Promise<WorkspaceDecision | undefined> {
  const workspace = config ?? await readWorkspace(root);
  if (!workspace) throw new Error(`No Horizon workspace found at ${path.resolve(root)}`);
  const entries = await readWorkspaceLedger(root, workspace);
  return entries.find((entry) => entry.decision.id === id);
}
export function searchWorkspaceLedger(
  entries: WorkspaceDecision[],
  query: string,
): WorkspaceSearchHit[] {
  const hits = searchLedger(entries.map((entry) => entry.decision), query);
  const byDecision = new Map<Decision, WorkspaceDecision>(
    entries.map((entry) => [entry.decision, entry]),
  );
  return hits.flatMap((hit) => {
    const entry = byDecision.get(hit.decision);
    if (!entry) return [];
    return [{
      rootId: entry.rootId,
      rootName: entry.rootName,
      rootPath: entry.rootPath,
      decision: entry.decision,
      relevance: hit.score,
      reason: hit.reason,
    }];
  });
}

export async function workspaceDiagnostics(
  root: string,
  entries: WorkspaceDecision[],
  config: WorkspaceConfig,
): Promise<WorkspaceDiagnostic[]> {
  const diagnostics: WorkspaceDiagnostic[] = [];
  const byId = new Map<string, WorkspaceDecision>();

  for (const entry of entries) {
    const existing = byId.get(entry.decision.id);
    if (existing) {
      diagnostics.push({
        rootId: entry.rootId,
        rootName: entry.rootName,
        level: 'error',
        id: entry.decision.id,
        message: `Decision ID ${entry.decision.id} is duplicated across ${existing.rootName} and ${entry.rootName}`,
      });
      continue;
    }
    byId.set(entry.decision.id, entry);
  }

  for (const entry of entries) {
    for (const diagnostic of validateLedger([entry.decision])) {
      if (diagnostic.kind) continue;
      diagnostics.push({
        rootId: entry.rootId,
        rootName: entry.rootName,
        level: diagnostic.level,
        id: diagnostic.id,
        message: diagnostic.message,
      });
    }
  }

  for (const workspaceRoot of config.roots) {
    if (workspaceRoot.enabled === false) continue;
    try {
      await fs.access(path.join(path.resolve(root, workspaceRoot.path), '.horizon'));
    } catch {
      diagnostics.push({
        rootId: workspaceRoot.id,
        rootName: workspaceRoot.name,
        level: 'error',
        message: `Workspace root cannot be read: ${workspaceRoot.path}`,
      });
    }
  }

  return diagnostics;
}

export function workspaceSummary(
  entries: WorkspaceDecision[],
  config: WorkspaceConfig,
): WorkspaceSummary {
  return {
    name: config.name,
    roots: workspaceRootSummaries(config, entries),
    decisions: entries.length,
  };
}

function packWorkspaceContext(
  hits: WorkspaceSearchHit[],
  maxTokens?: number,
): { decisions: WorkspaceSearchHit[]; packing: ContextPacking } {
  const estimatedTokens = hits.reduce((sum, hit) => sum + estimateDecisionTokens(hit.decision), 0);
  if (maxTokens === undefined) {
    return {
      decisions: hits,
      packing: { mode: 'unlimited', estimatedTokens, included: hits.length, omitted: [] },
    };
  }
  if (!Number.isFinite(maxTokens) || maxTokens <= 0 || !Number.isInteger(maxTokens)) {
    throw new Error('maxTokens must be a positive integer');
  }

  const ranked = [...hits].sort((left, right) =>
    compareDecisionsForContext(left.decision, right.decision) || left.decision.id.localeCompare(right.decision.id),
  );
  const included: WorkspaceSearchHit[] = [];
  const omitted: NonNullable<ContextPacking['omitted']> = [];
  let used = 0;
  for (const hit of ranked) {
    const cost = estimateDecisionTokens(hit.decision);
    if (used + cost > maxTokens) {
      omitted.push({ decisionId: hit.decision.id, reason: 'budget', estimatedTokens: cost });
      continue;
    }
    included.push(hit);
    used += cost;
  }

  return {
    decisions: included,
    packing: { mode: 'budget', maxTokens, estimatedTokens: used, included: included.length, omitted },
  };
}

export async function buildWorkspaceContext(
  root: string,
  query: string,
  config?: WorkspaceConfig,
  maxTokens?: number,
): Promise<WorkspaceContext> {
  const workspace = config ?? await readWorkspace(root);
  if (!workspace) throw new Error(`No Horizon workspace found at ${path.resolve(root)}`);

  const entries = await readWorkspaceLedger(root, workspace);
  const { decisions, packing } = packWorkspaceContext(searchWorkspaceLedger(entries, query), maxTokens);
  return {
    version: 1,
    root: path.resolve(root),
    query,
    roots: workspaceRootSummaries(workspace, entries),
    decisions,
    conflicts: findConflicts(entries.map((entry) => entry.decision)),
    diagnostics: await workspaceDiagnostics(root, entries, workspace),
    packing,
  };
}

export async function auditWorkspace(
  root: string,
  config?: WorkspaceConfig,
): Promise<WorkspaceAudit> {
  const workspace = config ?? await readWorkspace(root);
  if (!workspace) throw new Error(`No Horizon workspace found at ${path.resolve(root)}`);

  const entries = await readWorkspaceLedger(root, workspace);
  const diagnostics = await workspaceDiagnostics(root, entries, workspace);
  const findings: WorkspaceAuditFinding[] = [];
  let verified = 0;
  let missing = 0;
  let external = 0;
  let unverifiable = 0;

  for (const workspaceRoot of workspace.roots) {
    if (workspaceRoot.enabled === false) continue;
    const rootEntries = entries.filter((entry) => entry.rootId === workspaceRoot.id);
    const resolvedRoot = path.resolve(root, workspaceRoot.path);
    const audit = await auditLedger(rootEntries.map((entry) => entry.decision), resolvedRoot);
    verified += audit.verified;
    missing += audit.missing;
    external += audit.external;
    unverifiable += audit.unverifiable;
    for (const finding of audit.findings) {
      findings.push({
        ...finding,
        rootId: workspaceRoot.id,
        rootName: workspaceRoot.name,
        rootPath: workspaceRoot.path,
      });
    }
  }

  return {
    name: workspace.name,
    roots: workspaceRootSummaries(workspace, entries),
    decisions: entries.length,
    verified,
    missing,
    external,
    unverifiable,
    findings,
    diagnostics,
    ok: missing === 0 && !diagnostics.some((diagnostic) => diagnostic.level === 'error'),
  };
}
export function decisionRootPath(file: string, rootPath: string): string | undefined {
  const normalized = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (normalized === '.' || normalized === '') return file;
  const prefix = `${normalized}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : undefined;
}

export async function buildWorkspacePullRequestContext(
  root: string,
  base: string,
  head: string,
  files?: string[],
): Promise<WorkspacePullRequestContext> {
  const workspaceRoot = path.resolve(root);
  const workspace = await readWorkspace(workspaceRoot);
  if (!workspace) throw new Error(`No Horizon workspace found at ${workspaceRoot}`);

  const changed = files ?? await listChangedFiles(workspaceRoot, base, head);
  const entries = await readWorkspaceLedger(workspaceRoot, workspace);
  const decisions: WorkspacePullRequestDecision[] = [];
  const auditFindings: WorkspacePullRequestAuditFinding[] = [];
  const diagnostics: WorkspaceDiagnostic[] = [];
  let verified = 0;
  let missing = 0;
  let external = 0;
  let unverifiable = 0;

  for (const workspaceRootConfig of workspace.roots) {
    if (workspaceRootConfig.enabled === false) continue;
    const relevantFiles = changed
      .map((file) => ({ file, relative: decisionRootPath(file, workspaceRootConfig.path) }))
      .filter((item): item is { file: string; relative: string } => item.relative !== undefined);
    if (!relevantFiles.length) continue;

    const rootEntries = entries.filter((entry) => entry.rootId === workspaceRootConfig.id);
    const byId = new Map<string, Decision>();
    for (const item of relevantFiles) {
      for (const decision of decisionsForFile(rootEntries.map((entry) => entry.decision), item.relative)) {
        byId.set(decision.id, decision);
      }
    }
    const unique = [...byId.values()];
    for (const decision of unique) {
      decisions.push({
        rootId: workspaceRootConfig.id,
        rootName: workspaceRootConfig.name,
        rootPath: workspaceRootConfig.path,
        decision,
      });
    }

    const resolvedRoot = path.resolve(root, workspaceRootConfig.path);
    const audit = await auditLedger(unique, resolvedRoot);
    verified += audit.verified;
    missing += audit.missing;
    external += audit.external;
    unverifiable += audit.unverifiable;
    for (const finding of audit.findings) {
      auditFindings.push({ ...finding, rootId: workspaceRootConfig.id, rootName: workspaceRootConfig.name });
    }

    for (const diagnostic of validateLedger(unique)) {
      if (diagnostic.kind) continue;
      diagnostics.push({
        rootId: workspaceRootConfig.id,
        rootName: workspaceRootConfig.name,
        level: diagnostic.level,
        id: diagnostic.id,
        message: diagnostic.message,
      });
    }
  }

  return {
    version: 1,
    root: workspaceRoot,
    base,
    head,
    files: changed,
    decisions,
    conflicts: findConflicts(decisions.map((item) => item.decision)),
    audit: { verified, missing, external, unverifiable, findings: auditFindings },
    diagnostics,
  };
}

export async function buildWorkspaceChangeGate(
  root: string,
  base: string,
  head: string,
  files?: string[],
): Promise<WorkspaceChangeGate> {
  const workspaceRoot = path.resolve(root);
  const workspace = await readWorkspace(workspaceRoot);
  if (!workspace) throw new Error(`No Horizon workspace found at ${workspaceRoot}`);

  const changed = files ?? await listChangedFiles(workspaceRoot, base, head);
  const roots = workspace.roots.filter((item) => item.enabled !== false);
  const gates: WorkspaceRootGate[] = [];
  const decisions: WorkspacePullRequestDecision[] = [];
  const diagnostics: WorkspaceDiagnostic[] = [];
  const violations: WorkspaceGateViolation[] = [];
  const governed = new Set<string>();

  for (const workspaceRootConfig of roots) {
    const relevantFiles = changed
      .map((file) => ({ file, relative: decisionRootPath(file, workspaceRootConfig.path) }))
      .filter((item): item is { file: string; relative: string } => item.relative !== undefined);
    if (!relevantFiles.length) continue;

    const resolvedRoot = path.resolve(workspaceRoot, workspaceRootConfig.path);
    const gate = await buildChangeGate(resolvedRoot, relevantFiles.map((item) => item.relative));
    if (!gate.decisions.length) continue;

    gates.push({
      rootId: workspaceRootConfig.id,
      rootName: workspaceRootConfig.name,
      rootPath: workspaceRootConfig.path,
      files: relevantFiles.map((item) => item.relative),
      gate,
    });

    for (const decision of gate.decisions) {
      decisions.push({
        rootId: workspaceRootConfig.id,
        rootName: workspaceRootConfig.name,
        rootPath: workspaceRootConfig.path,
        decision,
      });
    }
    for (const violation of gate.violations) {
      violations.push({
        ...violation,
        rootId: workspaceRootConfig.id,
        rootName: workspaceRootConfig.name,
        rootPath: workspaceRootConfig.path,
      });
    }
    for (const diagnostic of gate.diagnostics) {
      diagnostics.push({
        rootId: workspaceRootConfig.id,
        rootName: workspaceRootConfig.name,
        level: diagnostic.level,
        id: diagnostic.id,
        message: diagnostic.message,
      });
    }
    if (gate.coverage.governed > 0) {
      for (const item of relevantFiles) governed.add(item.file);
    }
  }

  const verdict: GateVerdict = violations.some((item) => item.level === 'error')
    ? 'block'
    : violations.some((item) => item.level === 'warn') ? 'warn' : 'pass';

  return {
    version: 1,
    root: workspaceRoot,
    base,
    head,
    files: changed,
    roots,
    gates,
    decisions,
    coverage: {
      governed: governed.size,
      unguarded: changed.length - governed.size,
    },
    diagnostics,
    violations,
    verdict,
  };
}

export function workspaceChangeGateMarkdown(gate: WorkspaceChangeGate): string {
  const lines = [
    '# Horizon workspace change gate',
    '',
    `Verdict: **${gate.verdict.toUpperCase()}**`,
    `Changed paths: ${gate.files.length}`,
    `Governed paths: ${gate.coverage.governed}`,
    `Unguarded paths: ${gate.coverage.unguarded}`,
    '',
  ];

  if (!gate.gates.length) {
    lines.push('No policy-governed workspace decisions apply to the changed paths.', '');
  }

  for (const rootGate of gate.gates) {
    lines.push(
      `## [${rootGate.rootName}] ${rootGate.rootPath}`,
      '',
      `Verdict: **${rootGate.gate.verdict.toUpperCase()}**`,
      `Relative paths: ${rootGate.files.length}`,
      `Governed paths: ${rootGate.gate.coverage.governed}`,
      `Unguarded paths: ${rootGate.gate.coverage.unguarded}`,
      '',
    );
    for (const decision of rootGate.gate.decisions) {
      const score = scoreDecision(decision);
      lines.push(
        `### ${decision.id}: ${decision.title}`,
        '',
        `Status: ${decision.status}`,
        `Policy: ${decision.policy?.mode ?? 'observe'}`,
        `Evidence requirement: ${decision.policy?.requireEvidence ?? 'none'}`,
        `Quality: ${score.score}/${score.total}`,
        '',
      );
    }
    for (const violation of rootGate.gate.violations) {
      lines.push(`- ${violation.level.toUpperCase()}: ${violation.message}`);
    }
    lines.push('');
  }

  if (gate.diagnostics.length) {
    lines.push('## Workspace diagnostics', '');
    for (const diagnostic of gate.diagnostics) {
      lines.push(`- [${diagnostic.level}] ${diagnostic.rootName ? `${diagnostic.rootName}: ` : ''}${diagnostic.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
export function workspacePullRequestContextMarkdown(context: WorkspacePullRequestContext): string {
  const lines: string[] = [
    '## Horizon workspace decision context',
    '',
    `Changed paths: ${context.files.length ? context.files.map((file) => '`' + file + '`').join(', ') : '_none_'}`,
    '',
  ];

  if (!context.decisions.length) {
    lines.push('No recorded workspace decisions apply to the changed files.', '');
    return lines.join('\n');
  }

  for (const item of context.decisions) {
    const score = scoreDecision(item.decision);
    lines.push(
      `### [${item.rootName}] ${item.decision.id}: ${item.decision.title}`,
      '',
      `Status: **${item.decision.status}**`,
      `Quality: ${score.score}/${score.total}`,
      '',
    );
    if (item.decision.summary) lines.push(item.decision.summary.trim(), '');
    if (item.decision.decision) lines.push(`**Decision**: ${item.decision.decision.trim()}`, '');
    if (item.decision.consequences) lines.push(`**Consequences**: ${item.decision.consequences.trim()}`, '');
  }

  if (context.conflicts.length) {
    lines.push('### Workspace conflicts', '');
    for (const conflict of context.conflicts) lines.push(`- ${conflict.level.toUpperCase()}: ${conflict.message}`);
    lines.push('');
  }

  if (context.audit.missing) {
    lines.push('### Missing workspace evidence', '');
    for (const finding of context.audit.findings.filter((item) => item.status === 'missing')) {
      lines.push(`- [${finding.rootName}] ${finding.decisionId}/${finding.evidenceId}: ${finding.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
export async function exportWorkspace(
  root: string,
  config?: WorkspaceConfig,
): Promise<WorkspaceExport> {
  const workspace = config ?? await readWorkspace(root);
  if (!workspace) throw new Error(`No Horizon workspace found at ${path.resolve(root)}`);
  const entries = await readWorkspaceLedger(root, workspace);
  const diagnostics = await workspaceDiagnostics(root, entries, workspace);
  const audit = await auditWorkspace(root, workspace);
  return {
    version: 1,
    name: workspace.name,
    roots: workspaceRootSummaries(workspace, entries),
    decisions: entries,
    conflicts: findConflicts(entries.map((entry) => entry.decision)),
    diagnostics,
    audit: {
      verified: audit.verified,
      missing: audit.missing,
      external: audit.external,
      unverifiable: audit.unverifiable,
      findings: audit.findings,
    },
  };
}

export function workspaceExportMarkdown(exported: WorkspaceExport): string {
  const lines: string[] = [
    `# ${exported.name}`,
    '',
    `Roots: ${exported.roots.length}`,
    `Decisions: ${exported.decisions.length}`,
    '',
    '## Roots',
    '',
  ];
  for (const root of exported.roots) {
    lines.push(`- ${root.name} (${root.path}): ${root.decisions} decision${root.decisions === 1 ? '' : 's'}`);
  }
  lines.push('', '## Decisions', '');
  for (const entry of exported.decisions) {
    const score = scoreDecision(entry.decision);
    lines.push(`### [${entry.rootName}] ${entry.decision.id}: ${entry.decision.title}`, '', `Status: ${entry.decision.status}`, `Quality: ${score.score}/${score.total}`, '');
    if (entry.decision.summary) lines.push(entry.decision.summary.trim(), '');
    if (entry.decision.decision) lines.push(`**Decision**: ${entry.decision.decision.trim()}`, '');
    if (entry.decision.consequences) lines.push(`**Consequences**: ${entry.decision.consequences.trim()}`, '');
  }
  if (exported.conflicts.length) {
    lines.push('## Conflicts', '');
    for (const conflict of exported.conflicts) lines.push(`- [${conflict.level}] ${conflict.message}`);
    lines.push('');
  }
  if (exported.audit.missing) {
    lines.push('## Missing evidence', '');
    for (const finding of exported.audit.findings.filter((item) => item.status === 'missing')) {
      lines.push(`- [${finding.rootName}] ${finding.decisionId}/${finding.evidenceId}: ${finding.message}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
export async function validateWorkspace(
  root: string,
  config?: WorkspaceConfig,
): Promise<WorkspaceValidation> {
  const workspace = config ?? await readWorkspace(root);
  if (!workspace) throw new Error(`No Horizon workspace found at ${path.resolve(root)}`);

  const entries = await readWorkspaceLedger(root, workspace);
  const diagnostics = [
    ...await workspaceDiagnostics(root, entries, workspace),
    ...findConflicts(entries.map((entry) => entry.decision)).map((conflict) => ({
      rootId: entries.find((entry) => entry.decision.id === conflict.id)?.rootId,
      rootName: entries.find((entry) => entry.decision.id === conflict.id)?.rootName,
      level: conflict.level,
      id: conflict.id,
      message: conflict.message,
    })),
  ];
  return {
    name: workspace.name,
    roots: workspaceRootSummaries(workspace, entries),
    decisions: entries.length,
    diagnostics,
    ok: !diagnostics.some((diagnostic) => diagnostic.level === 'error'),
  };
}

export function workspaceContextMarkdown(context: WorkspaceContext): string {
  const lines: string[] = [
    '# Horizon workspace context',
    '',
    `Query: \`${context.query}\``,
    `Roots: ${context.roots.filter((root) => root.enabled).length}`,
    `Decisions: ${context.decisions.length}`,
    context.packing?.mode === 'budget'
      ? `Budget: ${context.packing.estimatedTokens}/${context.packing.maxTokens} estimated tokens`
      : `Estimated tokens: ${context.packing?.estimatedTokens ?? 0}`,
    '',
  ];

  if (context.packing?.omitted.length) {
    lines.push('Omitted by budget:', '');
    for (const item of context.packing.omitted) {
      lines.push(`- ${item.decisionId} (${item.estimatedTokens} estimated tokens)`);
    }
    lines.push('');
  }

  if (!context.decisions.length) {
    lines.push('No relevant decisions found.', '');
  }

  for (const hit of context.decisions) {
    const score = scoreDecision(hit.decision);
    lines.push(
      `## [${hit.rootName}] ${hit.decision.id}: ${hit.decision.title}`,
      '',
      `Status: ${hit.decision.status}`,
      `Relevance: ${hit.relevance} (${hit.reason})`,
      `Quality: ${score.score}/${score.total}`,
      '',
    );
    if (hit.decision.summary) lines.push(hit.decision.summary.trim(), '');
    if (hit.decision.decision) lines.push(`**Decision**: ${hit.decision.decision.trim()}`, '');
    if (hit.decision.consequences) lines.push(`**Consequences**: ${hit.decision.consequences.trim()}`, '');
  }

  if (context.conflicts.length) {
    lines.push('## Workspace conflicts', '');
    for (const conflict of context.conflicts) lines.push(`- [${conflict.level}] ${conflict.message}`);
    lines.push('');
  }

  if (context.diagnostics.length) {
    lines.push('## Workspace diagnostics', '');
    for (const diagnostic of context.diagnostics) {
      lines.push(`- [${diagnostic.level}] ${diagnostic.rootName ? `${diagnostic.rootName}: ` : ''}${diagnostic.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

