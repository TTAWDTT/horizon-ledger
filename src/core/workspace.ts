import fs from 'node:fs/promises';
import path from 'node:path';
import type { Decision } from './types';
import { readLedger } from './ledger';
import { validateLedger, type Diagnostic } from './validate';
import { scoreDecision } from './score';
import { findConflicts, type ConflictDiagnostic } from './conflicts';
import { searchLedger } from './search';

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

export async function readWorkspace(root: string): Promise<WorkspaceConfig | undefined> {
  try {
    const raw = await fs.readFile(workspaceConfigPath(root), 'utf8');
    const parsed = JSON.parse(raw) as WorkspaceConfig;
    if (parsed.version !== 1 || typeof parsed.name !== 'string' || !Array.isArray(parsed.roots)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export async function writeWorkspace(root: string, config: WorkspaceConfig): Promise<void> {
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
  const config = await readWorkspace(workspaceRoot) ?? await initWorkspace(workspaceRoot);
  const resolvedTarget = path.resolve(workspaceRoot, target);

  try {
    await fs.access(path.join(resolvedTarget, '.horizon'));
  } catch {
    throw new Error(`Not a Horizon ledger: ${resolvedTarget}`);
  }

  const rootName = name ?? path.basename(resolvedTarget);
  if (!rootName.trim()) throw new Error('Workspace root name cannot be empty.');
  if (config.roots.some((root) => root.name === rootName)) {
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

function workspaceRootSummaries(
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

export async function buildWorkspaceContext(
  root: string,
  query: string,
  config?: WorkspaceConfig,
): Promise<WorkspaceContext> {
  const workspace = config ?? await readWorkspace(root);
  if (!workspace) throw new Error(`No Horizon workspace found at ${path.resolve(root)}`);

  const entries = await readWorkspaceLedger(root, workspace);
  return {
    version: 1,
    root: path.resolve(root),
    query,
    roots: workspaceRootSummaries(workspace, entries),
    decisions: searchWorkspaceLedger(entries, query),
    conflicts: findConflicts(entries.map((entry) => entry.decision)),
    diagnostics: await workspaceDiagnostics(root, entries, workspace),
  };
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
    '',
  ];

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


