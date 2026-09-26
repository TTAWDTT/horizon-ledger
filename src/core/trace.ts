import path from 'node:path';
import type { Decision } from './types';
import { readLedger } from './ledger';
import { commitReferencesDecision, commitTouchesScope, listCommits, normalizeCommitSha, type CommitInfo } from './commit';

export type TraceReason = 'evidence' | 'reference' | 'scope';

export interface TraceCommitMatch {
  sha: string;
  shortSha: string;
  subject: string;
  files: string[];
  reasons: TraceReason[];
  evidenceIds: string[];
}

export interface CommitTrace extends CommitInfo {
  decisionIds: string[];
}

export interface DecisionTrace {
  id: string;
  title: string;
  status: Decision['status'];
  scope: string[];
  commits: TraceCommitMatch[];
}

export interface TraceSummary {
  commits: number;
  attributedCommits: number;
  unattributedCommits: number;
  decisions: number;
  decisionsWithCommits: number;
}

export interface TraceReport {
  version: 1;
  root: string;
  base: string;
  head: string;
  summary: TraceSummary;
  commits: CommitTrace[];
  decisions: DecisionTrace[];
}

export interface TraceOptions {
  decisionId?: string;
}

export async function buildTrace(
  root: string,
  base: string,
  head: string,
  options: TraceOptions = {},
): Promise<TraceReport> {
  const resolvedRoot = path.resolve(root);
  const ledger = await readLedger(resolvedRoot);
  const requestedId = options.decisionId?.trim();
  const decisions = requestedId
    ? ledger.filter((decision) => decision.id.toLowerCase() === requestedId.toLowerCase())
    : ledger;
  const commits = await listCommits(resolvedRoot, base, head);

  const commitTraces = new Map<string, CommitTrace>();
  const decisionMatches = new Map<string, Map<string, TraceCommitMatch>>();
  for (const decision of decisions) decisionMatches.set(decision.id, new Map());

  for (const commit of commits) {
    commitTraces.set(commit.sha, { ...commit, decisionIds: [] });

    for (const decision of decisions) {
      const evidenceIds = (decision.evidence ?? [])
        .filter((evidence) => evidence.type === 'commit' && normalizeCommitSha(evidence.value) === commit.sha)
        .map((evidence) => evidence.id);
      const reasons: TraceReason[] = [];
      if (evidenceIds.length) reasons.push('evidence');
      if (commitReferencesDecision(commit, decision.id)) reasons.push('reference');
      if (commitTouchesScope(commit, decision.scope ?? [])) reasons.push('scope');

      if (!reasons.length) continue;
      addDecisionMatch(decisionMatches, decision.id, commit, reasons, evidenceIds);
      const commitTrace = commitTraces.get(commit.sha);
      if (commitTrace && !commitTrace.decisionIds.includes(decision.id)) commitTrace.decisionIds.push(decision.id);
    }
  }

  const decisionsOut = decisions.map((decision) => ({
    id: decision.id,
    title: decision.title,
    status: decision.status,
    scope: decision.scope ?? [],
    commits: [...(decisionMatches.get(decision.id)?.values() ?? [])].sort((a, b) => a.sha.localeCompare(b.sha)),
  }));
  const commitsOut = [...commitTraces.values()].sort((a, b) => a.sha.localeCompare(b.sha));
  const attributed = commitsOut.filter((commit) => commit.decisionIds.length > 0).length;

  return {
    version: 1,
    root: resolvedRoot,
    base,
    head,
    summary: {
      commits: commitsOut.length,
      attributedCommits: attributed,
      unattributedCommits: commitsOut.length - attributed,
      decisions: decisions.length,
      decisionsWithCommits: decisionsOut.filter((decision) => decision.commits.length > 0).length,
    },
    commits: commitsOut,
    decisions: decisionsOut,
  };
}

export function traceMarkdown(report: TraceReport): string {
  const lines = [
    '# Horizon commit trace',
    '',
    `Range: \`${report.base}..${report.head}\``,
    `Commits: ${report.summary.commits}`,
    `Attributed commits: ${report.summary.attributedCommits}`,
    `Unattributed commits: ${report.summary.unattributedCommits}`,
    `Decisions: ${report.summary.decisions}`,
    `Decisions with commits: ${report.summary.decisionsWithCommits}`,
    '',
  ];

  if (!report.decisions.length) lines.push('No decisions matched the trace.', '');

  for (const decision of report.decisions) {
    lines.push(`## ${decision.id}: ${decision.title}`, '', `Status: ${decision.status}`, '');
    if (!decision.commits.length) {
      lines.push('No commits in this range are linked to the decision.', '');
      continue;
    }
    for (const match of decision.commits) {
      lines.push(`- \`${match.shortSha}\` ${match.subject} (${match.reasons.join(', ')})`);
    }
    lines.push('');
  }

  const unmatched = report.commits.filter((commit) => !commit.decisionIds.length);
  if (unmatched.length) {
    lines.push('## Commits without decision attribution', '');
    for (const commit of unmatched) {
      lines.push(`- \`${commit.shortSha}\` ${commit.subject} (${commit.files.length} files)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function addDecisionMatch(
  map: Map<string, Map<string, TraceCommitMatch>>,
  decisionId: string,
  commit: CommitInfo,
  reasons: TraceReason[],
  evidenceIds: string[],
): void {
  const decisions = map.get(decisionId) ?? new Map<string, TraceCommitMatch>();
  const existing = decisions.get(commit.sha);
  if (existing) {
    for (const reason of reasons) if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    for (const evidenceId of evidenceIds) if (!existing.evidenceIds.includes(evidenceId)) existing.evidenceIds.push(evidenceId);
  } else {
    decisions.set(commit.sha, {
      sha: commit.sha,
      shortSha: commit.shortSha,
      subject: commit.subject,
      files: commit.files,
      reasons: [...reasons],
      evidenceIds: [...evidenceIds],
    });
  }
  map.set(decisionId, decisions);
}

