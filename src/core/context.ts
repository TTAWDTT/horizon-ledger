import path from 'node:path';
import type { Decision } from './types';
import { readLedger } from './ledger';
import { searchLedger } from './search';
import { decisionsForFile } from './relevance';
import { findConflicts } from './conflicts';
import { auditLedger, type LedgerAudit } from './audit';
import { scoreDecision } from './score';
import { validateLedger, type Diagnostic } from './validate';

export interface ContextPackingOmission {
  decisionId: string;
  reason: 'budget';
  estimatedTokens: number;
}

export interface ContextPacking {
  mode: 'unlimited' | 'budget';
  maxTokens?: number;
  estimatedTokens: number;
  included: number;
  omitted: ContextPackingOmission[];
}

export interface ContextBundle {
  version: 1;
  root: string;
  query: string;
  queryKind: 'path' | 'text';
  decisions: Decision[];
  conflicts: ReturnType<typeof findConflicts>;
  audit: Awaited<ReturnType<typeof auditLedger>>;
  diagnostics: Diagnostic[];
  packing: ContextPacking;
}

export function estimateDecisionTokens(decision: Decision): number {
  const text = [
    decision.id,
    decision.title,
    decision.status,
    decision.summary,
    decision.context,
    decision.decision,
    decision.consequences,
    (decision.scope ?? []).join(' '),
    (decision.tags ?? []).join(' '),
    (decision.alternatives ?? []).map((item) => `${item.name} ${item.verdict ?? ''} ${item.reason ?? ''}`).join(' '),
    (decision.evidence ?? []).map((item) => `${item.id} ${item.type} ${item.value} ${item.note ?? ''}`).join(' '),
  ].filter(Boolean).join('\n');
  return Math.max(1, Math.ceil(text.length / 4));
}

export function compareDecisionsForContext(left: Decision, right: Decision): number {
  const leftRank = contextRank(left);
  const rightRank = contextRank(right);
  return leftRank[0] - rightRank[0] || leftRank[1] - rightRank[1] || leftRank[2] - rightRank[2] || leftRank[3].localeCompare(rightRank[3]);
}

function contextRank(decision: Decision): [number, number, number, string] {
  const mode = decision.policy?.mode;
  const policyRank = mode === 'block' ? 0 : mode === 'review' ? 1 : 2;
  const statusRank = decision.status === 'decided' ? 0 : decision.status === 'proposed' ? 1 : 2;
  return [policyRank, statusRank, -scoreDecision(decision).score, decision.id];
}

function packContextDecisions(decisions: Decision[], maxTokens?: number): { decisions: Decision[]; packing: ContextPacking } {
  if (maxTokens === undefined) {
    const estimatedTokens = decisions.reduce((sum, decision) => sum + estimateDecisionTokens(decision), 0);
    return {
      decisions,
      packing: { mode: 'unlimited', estimatedTokens, included: decisions.length, omitted: [] },
    };
  }
  if (!Number.isFinite(maxTokens) || maxTokens <= 0 || !Number.isInteger(maxTokens)) {
    throw new Error('maxTokens must be a positive integer');
  }

  const ranked = [...decisions].sort((left, right) => {
    const leftRank = contextRank(left);
    const rightRank = contextRank(right);
    return leftRank[0] - rightRank[0] || leftRank[1] - rightRank[1] || leftRank[2] - rightRank[2] || leftRank[3].localeCompare(rightRank[3]);
  });
  const included: Decision[] = [];
  const omitted: ContextPackingOmission[] = [];
  let used = 0;
  for (const decision of ranked) {
    const estimatedTokens = estimateDecisionTokens(decision);
    if (used + estimatedTokens > maxTokens) {
      omitted.push({ decisionId: decision.id, reason: 'budget', estimatedTokens });
      continue;
    }
    included.push(decision);
    used += estimatedTokens;
  }
  return {
    decisions: included,
    packing: { mode: 'budget', maxTokens, estimatedTokens: used, included: included.length, omitted },
  };
}

export async function buildContextBundle(
  root: string,
  query: string,
  limit = 10,
  maxTokens?: number,
): Promise<ContextBundle> {
  const resolvedRoot = path.resolve(root);
  return buildContextBundleFromLedger(await readLedger(root), resolvedRoot, query, limit, maxTokens);
}

export function buildContextBundleFromLedger(
  ledger: Decision[],
  root: string,
  query: string,
  limit = 10,
  maxTokens?: number,
): Promise<ContextBundle> {
  const looksLikePath = /[\\/]/.test(query);
  const selected = looksLikePath
    ? decisionsForFile(ledger, query)
    : searchLedger(ledger, query).slice(0, Math.max(1, limit)).map((hit) => hit.decision);
  const { decisions, packing } = packContextDecisions(selected, maxTokens);
  const auditPromise = auditLedger(decisions, root);
  const conflicts = findConflicts(decisions);
  const diagnostics = validateLedger(decisions);
  return auditPromise.then((audit) => ({
    version: 1 as const,
    root: path.resolve(root),
    query,
    queryKind: looksLikePath ? 'path' as const : 'text' as const,
    decisions,
    conflicts,
    audit,
    diagnostics,
    packing,
  }));
}

export function contextBundleMarkdown(bundle: ContextBundle): string {
  const lines = [
    '# Horizon decision context',
    '',
    `Query: \`${bundle.query}\``,
    `Root: ${bundle.root}`,
    '',
    `Relevant decisions: ${bundle.decisions.length}`,
    bundle.packing.mode === 'budget'
      ? `Budget: ${bundle.packing.estimatedTokens}/${bundle.packing.maxTokens} estimated tokens`
      : `Estimated tokens: ${bundle.packing.estimatedTokens}`,
    '',
  ];

  if (bundle.packing.omitted.length) {
    lines.push('Omitted by budget:', '');
    for (const item of bundle.packing.omitted) {
      lines.push(`- ${item.decisionId} (${item.estimatedTokens} estimated tokens)`);
    }
    lines.push('');
  }

  if (!bundle.decisions.length) return lines.join('\n');

  for (const decision of bundle.decisions) {
    const score = scoreDecision(decision);
    lines.push(`## ${decision.id}: ${decision.title}`, '', `Status: ${decision.status}`, `Quality: ${score.score}/${score.total}`, '');
    if (decision.summary) lines.push('**Summary**', '', decision.summary.trim(), '');
    if (decision.context) lines.push('**Context**', '', decision.context.trim(), '');
    if (decision.decision) lines.push('**Decision**', '', decision.decision.trim(), '');
    if (decision.consequences) lines.push('**Consequences**', '', decision.consequences.trim(), '');
    if (decision.alternatives?.length) {
      lines.push('**Alternatives**', '');
      for (const alternative of decision.alternatives) {
        lines.push(`- ${alternative.name} (${alternative.verdict ?? 'unknown'})${alternative.reason ? `: ${alternative.reason}` : ''}`);
      }
      lines.push('');
    }
    if (decision.evidence?.length) {
      lines.push('**Evidence**', '');
      for (const evidence of decision.evidence) {
        lines.push(`- ${evidence.type}: ${evidence.value}${evidence.strength ? ` (${evidence.strength})` : ''}`);
      }
      lines.push('');
    }
  }

  if (bundle.conflicts.length) {
    lines.push('## Conflicts', '');
    for (const conflict of bundle.conflicts) lines.push(`- ${conflict.level.toUpperCase()}: ${conflict.message}`);
    lines.push('');
  }
  if (bundle.audit.missing) {
    lines.push('## Evidence audit', '');
    for (const finding of bundle.audit.findings) {
      if (finding.status === 'missing') lines.push(`- MISSING ${finding.decisionId}/${finding.evidenceId}: ${finding.message}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
