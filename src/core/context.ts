import path from 'node:path';
import type { Decision } from './types';
import { readLedger } from './ledger';
import { searchLedger } from './search';
import { decisionsForFile } from './relevance';
import { findConflicts } from './conflicts';
import { auditLedger, type LedgerAudit } from './audit';
import { scoreDecision } from './score';
import { validateLedger, type Diagnostic } from './validate';

export interface ContextBundle {
  version: 1;
  root: string;
  query: string;
  queryKind: 'path' | 'text';
  decisions: Decision[];
  conflicts: ReturnType<typeof findConflicts>;
  audit: Awaited<ReturnType<typeof auditLedger>>;
  diagnostics: Diagnostic[];
}

export async function buildContextBundle(root: string, query: string, limit = 10): Promise<ContextBundle> {
  const resolvedRoot = path.resolve(root);
  return buildContextBundleFromLedger(await readLedger(root), resolvedRoot, query, limit);
}

export function buildContextBundleFromLedger(ledger: Decision[], root: string, query: string, limit = 10): Promise<ContextBundle> {
  const looksLikePath = /[\\/]/.test(query);
  const decisions = looksLikePath
    ? decisionsForFile(ledger, query)
    : searchLedger(ledger, query).slice(0, Math.max(1, limit)).map((hit) => hit.decision);
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
    '',
  ];

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
