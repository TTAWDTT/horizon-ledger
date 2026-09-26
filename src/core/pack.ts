import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readDecisionFile } from './ledger';
import { findConflicts, type ConflictDiagnostic } from './conflicts';
import { auditWorkspace, readWorkspace, readWorkspaceLedger, workspaceDiagnostics, workspaceSummary, type WorkspaceConfig, type WorkspaceDiagnostic, type WorkspaceRootSummary } from './workspace';
import { HORIZON_VERSION } from '../version';
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
