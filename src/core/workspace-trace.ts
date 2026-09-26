import path from 'node:path';
import type { CommitInfo } from './commit';
import type { TraceCommitMatch, TraceReason } from './trace';
import { commitReferencesDecision, listCommits, normalizeCommitSha, pathMatchesScope } from './commit';
import { listChangedFiles } from './pr-context';
import {
  decisionRootPath,
  readWorkspace,
  readWorkspaceLedger,
  workspaceRootSummaries,
  type WorkspaceRootSummary,
} from './workspace';

export interface WorkspaceTraceMatch {
  rootId: string;
  rootName: string;
  rootPath: string;
  decisionId: string;
  decisionTitle: string;
  reasons: TraceReason[];
  evidenceIds: string[];
}

export interface WorkspaceCommitTrace extends CommitInfo {
  matches: WorkspaceTraceMatch[];
}

export interface WorkspaceTraceDecision {
  rootId: string;
  rootName: string;
  rootPath: string;
  decisionId: string;
  title: string;
  status: string;
  scope: string[];
  commits: TraceCommitMatch[];
}

export interface WorkspaceTraceSummary {
  commits: number;
  attributedCommits: number;
  unattributedCommits: number;
  roots: number;
  decisions: number;
  decisionsWithCommits: number;
  matchedRoots: number;
}

export interface WorkspaceTraceReport {
  version: 1;
  root: string;
  workspace: string;
  base: string;
  head: string;
  files: string[];
  roots: WorkspaceRootSummary[];
  summary: WorkspaceTraceSummary;
  commits: WorkspaceCommitTrace[];
  decisions: WorkspaceTraceDecision[];
}

export interface WorkspaceTraceOptions {
  files?: string[];
  decisionId?: string;
}

export async function buildWorkspaceTrace(
  root: string,
  base: string,
  head: string,
  options: WorkspaceTraceOptions = {},
): Promise<WorkspaceTraceReport> {
  const workspaceRoot = path.resolve(root);
  const workspace = await readWorkspace(workspaceRoot);
  if (!workspace) throw new Error(`No Horizon workspace found at ${workspaceRoot}`);

  const files = options.files ?? await listChangedFiles(workspaceRoot, base, head);
  const entries = await readWorkspaceLedger(workspaceRoot, workspace);
  const commits = (await listCommits(workspaceRoot, base, head)).map((commit) => ({ ...commit, matches: [] as WorkspaceTraceMatch[] }));
  const decisions: WorkspaceTraceDecision[] = [];

  for (const rootConfig of workspace.roots.filter((item) => item.enabled !== false)) {
    const rootEntries = entries.filter((entry) => entry.rootId === rootConfig.id);
    for (const entry of rootEntries) {
      const decision = entry.decision;
      if (options.decisionId?.trim() && decision.id.toLowerCase() !== options.decisionId.trim().toLowerCase()) continue;
      const key = `${rootConfig.id}:${decision.id}`;
      decisions.push({
        rootId: rootConfig.id,
        rootName: rootConfig.name,
        rootPath: rootConfig.path,
        decisionId: decision.id,
        title: decision.title,
        status: decision.status,
        scope: decision.scope ?? [],
        commits: [],
      });
    }
  }

  for (const commit of commits) {
    for (const rootConfig of workspace.roots.filter((item) => item.enabled !== false)) {
      const relativeFiles = commit.files
        .map((file) => decisionRootPath(file, rootConfig.path))
        .filter((file): file is string => Boolean(file));

      for (const entry of entries.filter((item) => item.rootId === rootConfig.id)) {
        const decision = entry.decision;
        if (options.decisionId?.trim() && decision.id.toLowerCase() !== options.decisionId.trim().toLowerCase()) continue;
        const evidenceIds = (decision.evidence ?? [])
          .filter((evidence) => evidence.type === 'commit' && normalizeCommitSha(evidence.value) === commit.sha)
          .map((evidence) => evidence.id);
        const reasons: TraceReason[] = [];
        if (evidenceIds.length) reasons.push('evidence');
        if (commitReferencesDecision(commit, decision.id)) reasons.push('reference');
        if (relativeFiles.some((file) => pathMatchesScope(file, decision.scope ?? []))) reasons.push('scope');
        if (!reasons.length) continue;

        commit.matches.push({
          rootId: rootConfig.id,
          rootName: rootConfig.name,
          rootPath: rootConfig.path,
          decisionId: decision.id,
          decisionTitle: decision.title,
          reasons: [...reasons],
          evidenceIds: [...evidenceIds],
        });

        const decisionTrace = decisionsByWorkspaceId(decisions, rootConfig.id, decision.id);
        if (!decisionTrace) continue;
        const existing = decisionTrace.commits.find((item) => item.sha === commit.sha);
        if (existing) {
          for (const reason of reasons) if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
          for (const evidenceId of evidenceIds) if (!existing.evidenceIds.includes(evidenceId)) existing.evidenceIds.push(evidenceId);
        } else {
          decisionTrace.commits.push({
            sha: commit.sha,
            shortSha: commit.shortSha,
            subject: commit.subject,
            files: relativeFiles,
            reasons: [...reasons],
            evidenceIds: [...evidenceIds],
          });
        }
      }
    }
  }

  const attributed = commits.filter((commit) => commit.matches.length > 0).length;
  const matchedRoots = new Set(
    commits.flatMap((commit) => commit.matches.map((match) => match.rootId)),
).size;

  return {
    version: 1 as const,
    root: workspaceRoot,
    workspace: workspace.name,
    base,
    head,
    files,
    roots: workspaceRootSummaries(workspace, entries),
    summary: {
      commits: commits.length,
      attributedCommits: attributed,
      unattributedCommits: commits.length - attributed,
      roots: workspace.roots.length,
      decisions: decisions.length,
      decisionsWithCommits: decisions.filter((item) => item.commits.length > 0).length,
      matchedRoots,
    },
    commits,
    decisions,
  };
}

export function workspaceTraceMarkdown(report: WorkspaceTraceReport): string {
  const lines = [
    '',
    `Workspace: ${report.workspace}`,
    `Range: \`${report.base}..${report.head}\``,
    `Commits: ${report.summary.commits}`,
    `Attributed commits: ${report.summary.attributedCommits}`,
    `Unattributed commits: ${report.summary.unattributedCommits}`,
    `Decisions: ${report.summary.decisions}`,
    `Decisions with commits: ${report.summary.decisionsWithCommits}`,
    `Matched roots: ${report.summary.matchedRoots}`,
    '',
  ];

  if (!report.decisions.length) lines.push('No decisions matched the trace.', '');

  for (const decision of report.decisions) {
    lines.push(`## [${decision.rootName}] ${decision.decisionId}: ${decision.title}`, '', `Status: ${decision.status}`, '');
    if (!decision.commits.length) {
      lines.push('No commits in this range are linked to the decision.', '');
      continue;
    }
    for (const match of decision.commits) {
      lines.push(`- \`${match.shortSha}\` ${match.subject} (${match.reasons.join(', ')})`);
    }
    lines.push('');
  }

  const unmatched = report.commits.filter((commit) => !commit.matches.length);
  if (unmatched.length) {
    lines.push('## Commits without workspace decision attribution', '');
    for (const commit of unmatched) {
      lines.push(`- \`${commit.shortSha}\` ${commit.subject} (${commit.files.length} files)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function decisionsByWorkspaceId(decisions: WorkspaceTraceDecision[], rootId: string, decisionId: string): WorkspaceTraceDecision | undefined {
  return decisions.find((item) => item.rootId === rootId && item.decisionId === decisionId);
}





