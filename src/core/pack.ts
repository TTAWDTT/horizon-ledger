import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readDecisionFile } from './ledger';
import { findConflicts, type ConflictDiagnostic } from './conflicts';
import { auditWorkspace, readWorkspace, readWorkspaceLedger, workspaceDiagnostics, workspaceSummary, type WorkspaceConfig, type WorkspaceDiagnostic, type WorkspaceRootSummary } from './workspace';
import { HORIZON_VERSION } from '../version';
import { slugify } from './utils';
import { validateLedger } from './validate';
import { writeWorkspace } from './workspace';
import type { Decision } from './types';

export const WORKSPACE_PACK_KIND = 'horizon.workspace-pack';

export interface WorkspacePackDecision {
  rootId: string;
  rootName: string;
  rootPath: string;
  file: string;
  markdown: string;
  markdownSha256: string;
  decision: Decision;
}

export interface WorkspacePack {
  kind: typeof WORKSPACE_PACK_KIND;
  schemaVersion: 1;
  packId: string;
  producer: { name: 'horizon-ledger'; version: string };
  workspace: { name: string; decisionCount: number };
  roots: WorkspaceRootSummary[];
  decisions: WorkspacePackDecision[];
  conflicts: ConflictDiagnostic[];
  diagnostics: WorkspaceDiagnostic[];
  audit: {
    verified: number;
    missing: number;
    external: number;
    unverifiable: number;
  };
}

export interface WorkspacePackImportAction {
  kind: 'create-root' | 'create-decision' | 'reuse-decision' | 'reuse-root' | 'skip-root' | 'conflict';
  sourceRootId: string;
  sourceRootName: string;
  sourceRootPath: string;
  destinationRootId?: string;
  destinationRootName?: string;
  destinationRootPath?: string;
  decisionId?: string;
  file?: string;
  message: string;
}

export interface WorkspacePackImportPlan {
  version: 1;
  packId: string;
  destination: string;
  write: boolean;
  ok: boolean;
  roots: number;
  decisions: number;
  createRoots: number;
  createDecisions: number;
  reuseDecisions: number;
  conflicts: number;
  actions: WorkspacePackImportAction[];
  diagnostics: WorkspaceDiagnostic[];
}

export interface WorkspacePackInspection {
  packId: string;
  kind: string;
  schemaVersion: 1;
  workspace: { name: string; decisionCount: number };
  roots: number;
  decisions: number;
  decisionIds: string[];
  conflicts: number;
  diagnostics: number;
  audit: WorkspacePack['audit'];
}

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

function packIdFor(value: Omit<WorkspacePack, 'packId'>): string {
  return `sha256:${sha256(stableStringify(value))}`;
}

async function readWorkspaceDecisionFiles(
  workspaceRoot: string,
  workspace: WorkspaceConfig,
): Promise<Array<{ rootId: string; rootName: string; rootPath: string; file: string; markdown: string; decision: Decision }>> {
  const records: Array<{ rootId: string; rootName: string; rootPath: string; file: string; markdown: string; decision: Decision }> = [];

  for (const rootConfig of workspace.roots) {
    if (rootConfig.enabled === false) continue;
    const decisionDir = path.join(
      path.resolve(workspaceRoot, rootConfig.path),
      '.horizon',
      'decisions',
    );
    let files: string[] = [];
    try {
      files = (await fs.readdir(decisionDir)).filter((file) => file.endsWith('.md')).sort();
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = path.join(decisionDir, file);
      const markdown = await fs.readFile(filePath, 'utf8');
      const decision = await readDecisionFile(filePath);
      records.push({
        rootId: rootConfig.id,
        rootName: rootConfig.name,
        rootPath: rootConfig.path,
        file,
        markdown,
        decision,
      });
    }
  }

  return records;
}

export async function exportWorkspacePack(root: string, config?: WorkspaceConfig): Promise<WorkspacePack> {
  const workspace = config ?? await readWorkspace(root);
  if (!workspace) throw new Error(`No Horizon workspace found at ${path.resolve(root)}`);
  const entries = await readWorkspaceLedger(root, workspace);
  const records = await readWorkspaceDecisionFiles(root, workspace);
  const diagnostics = await workspaceDiagnostics(root, entries, workspace);
  const audit = await auditWorkspace(root, workspace);
  const summary = workspaceSummary(entries, workspace);

  const payload: Omit<WorkspacePack, 'packId'> = {
    kind: WORKSPACE_PACK_KIND,
    schemaVersion: 1,
    producer: { name: 'horizon-ledger', version: HORIZON_VERSION },
    workspace: {
      name: summary.name,
      decisionCount: entries.length,
    },
    roots: summary.roots,
    decisions: records.map((record) => ({
      rootId: record.rootId,
      rootName: record.rootName,
      rootPath: record.rootPath,
      file: record.file,
      markdown: record.markdown,
      markdownSha256: sha256(record.markdown),
      decision: record.decision,
    })),
    conflicts: findConflicts(entries.map((entry) => entry.decision)),
    diagnostics,
    audit: {
      verified: audit.verified,
      missing: audit.missing,
      external: audit.external,
      unverifiable: audit.unverifiable,
    },
  };

  return {
    ...payload,
    packId: packIdFor(payload),
  };
}

export function parseWorkspacePack(raw: string): WorkspacePack {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid Horizon workspace pack: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid Horizon workspace pack: expected a JSON object.');
  }
  const pack = parsed as WorkspacePack;
  if (pack.kind !== WORKSPACE_PACK_KIND || pack.schemaVersion !== 1) {
    throw new Error('Invalid Horizon workspace pack: unsupported kind or schema version.');
  }
  if (typeof pack.packId !== 'string' || !pack.packId.startsWith('sha256:')) {
    throw new Error('Invalid Horizon workspace pack: missing sha256 pack id.');
  }
  if (!Array.isArray(pack.decisions) || !Array.isArray(pack.roots)) {
    throw new Error('Invalid Horizon workspace pack: missing roots or decisions.');
  }
  if (typeof pack.workspace?.name !== 'string' || typeof pack.workspace.decisionCount !== 'number') {
    throw new Error('Invalid Horizon workspace pack: invalid workspace metadata.');
  }
  if (!Array.isArray(pack.conflicts) || !Array.isArray(pack.diagnostics)) {
    throw new Error('Invalid Horizon workspace pack: invalid diagnostics.');
  }
  if (typeof pack.audit?.verified !== 'number' || typeof pack.audit?.missing !== 'number') {
    throw new Error('Invalid Horizon workspace pack: invalid audit summary.');
  }

  const { packId, ...payload } = pack;
  const expected = packIdFor(payload as Omit<WorkspacePack, 'packId'>);
  if (packId !== expected) {
    throw new Error(`Invalid Horizon workspace pack: pack id mismatch (expected ${expected}, got ${packId}).`);
  }

  for (const decision of pack.decisions) {
    if (typeof decision.markdown !== 'string' || typeof decision.file !== 'string') {
      throw new Error('Invalid Horizon workspace pack: decision markdown is missing.');
    }
    if (sha256(decision.markdown) !== decision.markdownSha256) {
      throw new Error(`Invalid Horizon workspace pack: markdown hash mismatch for ${decision.decision?.id ?? decision.file}.`);
    }
    if (typeof decision.rootPath !== 'string' || path.isAbsolute(decision.rootPath) || decision.rootPath.split('/').includes('.horizon')) {
      throw new Error(`Invalid Horizon workspace pack: unsafe root path for ${decision.decision?.id ?? decision.file}.`);
    }
  }

  return pack;
}

export function inspectWorkspacePack(raw: string): WorkspacePackInspection {
  const pack = parseWorkspacePack(raw);
  return {
    packId: pack.packId,
    kind: pack.kind,
    schemaVersion: pack.schemaVersion,
    workspace: pack.workspace,
    roots: pack.roots.length,
    decisions: pack.decisions.length,
    decisionIds: pack.decisions.map((item) => item.decision.id),
    conflicts: pack.conflicts.length,
    diagnostics: pack.diagnostics.length,
    audit: pack.audit,
  };
}

function packIdShort(packId: string): string {
  return packId.replace(/^sha256:/u, '').slice(0, 12);
}

function nextWorkspaceRootNumber(roots: Array<{ id: string }>): number {
  const max = roots.reduce((value, root) => {
    const match = /^r-(\d+)$/u.exec(root.id);
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return max + 1;
}

function safePackRootName(name: string, index: number): string {
  const base = slugify(name) || `root-${index + 1}`;
  return base.length > 48 ? base.slice(0, 48) : base;
}

function safeDecisionFile(file: string): boolean {
  if (typeof file !== 'string' || !file.endsWith('.md')) return false;
  if (file !== path.posix.basename(file)) return false;
  if (file === '.' || file === '..' || file.startsWith('.')) return false;
  return /^[A-Za-z0-9._-]+\.md$/u.test(file);
}

export async function planWorkspacePackImport(
  root: string,
  raw: string,
): Promise<WorkspacePackImportPlan> {
  const destination = path.resolve(root);
  const workspace = await readWorkspace(destination);
  if (!workspace) throw new Error(`No Horizon workspace found at ${destination}`);
  const pack = parseWorkspacePack(raw);
  const entries = await readWorkspaceLedger(destination, workspace);
  const decisionsById = new Map(entries.map((entry) => [entry.decision.id, entry] as const));
  const actions: WorkspacePackImportAction[] = [];
  const diagnostics: WorkspaceDiagnostic[] = [];
  const usedSafeNames = new Set<string>();
  let createRoots = 0;
  let createDecisions = 0;
  let reuseDecisions = 0;
  let conflicts = 0;
  const shortId = packIdShort(pack.packId);

  pack.roots.forEach((sourceRoot, index) => {
    let safeName = safePackRootName(sourceRoot.name, index);
    while (usedSafeNames.has(safeName)) safeName = `${safeName}-${index + 1}`;
    usedSafeNames.add(safeName);
    const intendedName = `${safeName}-${shortId}`;
    const intendedPath = `horizon-imports/${shortId}/${safeName}`;
    const existingRoot = workspace.roots.find((root) =>
      root.name === intendedName || path.resolve(destination, root.path) === path.resolve(destination, intendedPath),
    );

    const packDecisions = pack.decisions.filter((item) => item.rootId === sourceRoot.id);
    if (!packDecisions.length) {
      actions.push({
        kind: 'skip-root',
        sourceRootId: sourceRoot.id,
        sourceRootName: sourceRoot.name,
        sourceRootPath: sourceRoot.path,
        message: 'No enabled decisions to import.',
      });
      return;
    }

    let destinationRootId = existingRoot?.id;
    let destinationRootName = existingRoot?.name;
    let destinationRootPath = existingRoot?.path;

    if (existingRoot) {
      if (existingRoot.name !== intendedName || existingRoot.path !== intendedPath) {
        conflicts++;
        actions.push({
          kind: 'conflict',
          sourceRootId: sourceRoot.id,
          sourceRootName: sourceRoot.name,
          sourceRootPath: sourceRoot.path,
          destinationRootId: existingRoot.id,
          destinationRootName: existingRoot.name,
          destinationRootPath: existingRoot.path,
          message: `Workspace root collision: intended ${intendedName} at ${intendedPath}, found ${existingRoot.name} at ${existingRoot.path}`,
        });
      } else {
        actions.push({
          kind: 'reuse-root',
          sourceRootId: sourceRoot.id,
          sourceRootName: sourceRoot.name,
          sourceRootPath: sourceRoot.path,
          destinationRootId: existingRoot.id,
          destinationRootName: existingRoot.name,
          destinationRootPath: existingRoot.path,
          message: `Reusing imported root ${existingRoot.name}`,
        });
      }
    } else {
      const nextNumber = nextWorkspaceRootNumber(workspace.roots) + createRoots;
      destinationRootId = `r-${String(nextNumber).padStart(3, '0')}`;
      createRoots++;
      actions.push({
        kind: 'create-root',
        sourceRootId: sourceRoot.id,
        sourceRootName: sourceRoot.name,
        sourceRootPath: sourceRoot.path,
        destinationRootId,
        destinationRootName: intendedName,
        destinationRootPath: intendedPath,
        message: `Create root ${intendedName} at ${intendedPath}`,
      });
    }

    for (const packDecision of packDecisions) {
      const existing = decisionsById.get(packDecision.decision.id);
      if (existing && stableStringify(existing.decision) === stableStringify(packDecision.decision)) {
        reuseDecisions++;
        actions.push({
          kind: 'reuse-decision',
          sourceRootId: sourceRoot.id,
          sourceRootName: sourceRoot.name,
          sourceRootPath: sourceRoot.path,
          destinationRootId: existing.rootId,
          destinationRootName: existing.rootName,
          destinationRootPath: existing.rootPath,
          decisionId: packDecision.decision.id,
          file: packDecision.file,
          message: `Decision ${packDecision.decision.id} already exists with equivalent content`,
        });
        continue;
      }

      if (existing) {
        conflicts++;
        actions.push({
          kind: 'conflict',
          sourceRootId: sourceRoot.id,
          sourceRootName: sourceRoot.name,
          sourceRootPath: sourceRoot.path,
          destinationRootId: existing.rootId,
          destinationRootName: existing.rootName,
          destinationRootPath: existing.rootPath,
          decisionId: packDecision.decision.id,
          file: packDecision.file,
          message: `Decision ${packDecision.decision.id} exists with different content`,
        });
        continue;
      }

      createDecisions++;
      actions.push({
        kind: 'create-decision',
        sourceRootId: sourceRoot.id,
        sourceRootName: sourceRoot.name,
        sourceRootPath: sourceRoot.path,
        destinationRootId,
        destinationRootName: intendedName,
        destinationRootPath: intendedPath,
        decisionId: packDecision.decision.id,
        file: packDecision.file,
        message: `Create ${packDecision.decision.id} in ${intendedPath}`,
      });
    }
  });

  return {
    version: 1,
    packId: pack.packId,
    destination,
    write: false,
    ok: conflicts === 0,
    roots: pack.roots.length,
    decisions: pack.decisions.length,
    createRoots,
    createDecisions,
    reuseDecisions,
    conflicts,
    actions,
    diagnostics,
  };
}

export async function importWorkspacePack(
  root: string,
  raw: string,
): Promise<WorkspacePackImportPlan> {
  const plan = await planWorkspacePackImport(root, raw);
  if (!plan.ok) {
    throw new Error(`Workspace pack import conflicts: ${plan.conflicts}`);
  }
  if (!plan.createRoots && !plan.createDecisions) {
    return { ...plan, write: true };
  }

  const destination = path.resolve(root);
  const workspace = await readWorkspace(destination);
  if (!workspace) throw new Error(`No Horizon workspace found at ${destination}`);
  const pack = parseWorkspacePack(raw);
  const decisionsById = new Map(pack.decisions.map((item) => [item.decision.id, item] as const));
  const createdRoots: WorkspaceConfig['roots'] = [];
  const writtenFiles: string[] = [];

  try {
    for (const action of plan.actions) {
      if (action.kind === 'create-root') {
        const rootPath = path.join(destination, action.destinationRootPath!);
        await fs.mkdir(path.join(rootPath, '.horizon', 'decisions'), { recursive: true });
        createdRoots.push({
          id: action.destinationRootId!,
          name: action.destinationRootName!,
          path: action.destinationRootPath!,
          enabled: true,
        });
      }

      if (action.kind === 'create-decision') {
        const packDecision = pack.decisions.find((item) => item.decision.id === action.decisionId);
        if (!packDecision) throw new Error(`Pack decision ${action.decisionId} disappeared during import`);
        if (!safeDecisionFile(packDecision.file)) {
          throw new Error(`Unsafe pack decision file: ${packDecision.file}`);
        }
        const diagnostics = validateLedger([packDecision.decision]).filter((item) => item.level === 'error');
        if (diagnostics.length) {
          throw new Error(`Pack decision ${packDecision.decision.id} is invalid: ${diagnostics.map((item) => item.message).join('; ')}`);
        }

        const target = path.join(destination, action.destinationRootPath!, '.horizon', 'decisions', packDecision.file);
        try {
          await fs.access(target);
          throw new Error(`Decision file already exists: ${target}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, packDecision.markdown, 'utf8');
        writtenFiles.push(target);
      }
    }

    const updatedRoots = [...workspace.roots];
    for (const action of plan.actions.filter((item) => item.kind === 'create-root')) {
      if (!action.destinationRootId || !action.destinationRootName || !action.destinationRootPath) continue;
      if (updatedRoots.some((root) => root.id === action.destinationRootId)) continue;
      updatedRoots.push({
        id: action.destinationRootId,
        name: action.destinationRootName,
        path: action.destinationRootPath,
        enabled: true,
      });
    }

    if (updatedRoots.length !== workspace.roots.length) {
      await writeWorkspace(destination, { ...workspace, roots: updatedRoots });
    }

    return { ...plan, write: true };
  } catch (error) {
    for (const file of writtenFiles) {
      await fs.rm(file, { force: true });
    }
    throw error;
  }
}

export function workspacePackImportPlanMarkdown(plan: WorkspacePackImportPlan): string {
  const lines: string[] = [
    '# Horizon workspace pack import',
    '',
    `Pack ID: \`${plan.packId}\``,
    `Destination: \`${plan.destination}\``,
    `Mode: ${plan.write ? 'write' : 'plan'}`,
    `Outcome: ${plan.ok ? 'ready' : 'blocked'}`,
    `Changes: ${plan.createRoots} root(s), ${plan.createDecisions} decision(s), ${plan.reuseDecisions} reused`,
    '',
  ];

  for (const action of plan.actions) {
    lines.push(`- [${action.kind}] ${action.message}`);
  }

  return lines.join('\n');
}

export function workspacePackMarkdown(pack: WorkspacePack): string {
  const lines: string[] = [
    '# Horizon workspace pack',
    '',
    `Pack ID: \`${pack.packId}\``,
    `Workspace: ${pack.workspace.name}`,
    `Roots: ${pack.roots.length}`,
    `Decisions: ${pack.decisions.length}`,
    `Audit: ${pack.audit.verified} verified, ${pack.audit.missing} missing, ${pack.audit.external} external, ${pack.audit.unverifiable} unverifiable`,
    '',
  ];

  if (pack.diagnostics.length) {
    lines.push('## Diagnostics', '');
    for (const diagnostic of pack.diagnostics) {
      lines.push(`- [${diagnostic.level}] ${diagnostic.rootName ? `${diagnostic.rootName}: ` : ''}${diagnostic.message}`);
    }
    lines.push('');
  }

  if (pack.conflicts.length) {
    lines.push('## Conflicts', '');
    for (const conflict of pack.conflicts) lines.push(`- [${conflict.level}] ${conflict.message}`);
    lines.push('');
  }

  lines.push('## Decisions', '');
  for (const decision of pack.decisions) {
    lines.push(`### [${decision.rootName}] ${decision.decision.id}: ${decision.decision.title}`, '');
    lines.push(`File: \`${decision.rootPath}/.horizon/decisions/${decision.file}\``, `Markdown SHA-256: \`${decision.markdownSha256}\``, '');
  }

  return lines.join('\n');
}
