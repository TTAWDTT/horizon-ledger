import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Decision } from './types';
import { readLedger } from './ledger';
import { decisionsForFile } from './relevance';
import { findConflicts } from './conflicts';
import { auditLedger } from './audit';
import { scoreDecision } from './score';
import { validateLedger, type Diagnostic } from './validate';

const execFileAsync = promisify(execFile);

export interface PullRequestContext {
  version: 1;
  root: string;
  base: string;
  head: string;
  files: string[];
  decisions: Decision[];
  conflicts: ReturnType<typeof findConflicts>;
  audit: Awaited<ReturnType<typeof auditLedger>>;
  diagnostics: Diagnostic[];
}


async function listChangedFiles(root: string, base: string, head: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['diff', '--name-only', `${base}...${head}`], { cwd: root });
  return stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}export async function buildPullRequestContext(
  root: string,
  base: string,
  head: string,
  files?: string[],
): Promise<PullRequestContext> {
  const resolvedRoot = path.resolve(root);
  const changed = files ?? await listChangedFiles(resolvedRoot, base, head);
  const ledger = await readLedger(root);
  const decisions = new Map<string, Decision>();
  for (const file of changed) {
    for (const decision of decisionsForFile(ledger, file)) {
      if (!decisions.has(decision.id)) decisions.set(decision.id, decision);
    }
  }
  const unique = [...decisions.values()];
  const audit = await auditLedger(unique, resolvedRoot);
  return {
    version: 1,
    root: resolvedRoot,
    base,
    head,
    files: changed,
    decisions: unique,
    conflicts: findConflicts(unique),
    audit,
    diagnostics: validateLedger(unique),
  };
}

export function pullRequestContextMarkdown(context: PullRequestContext): string {
  const lines = [
    '## Horizon decision context',
    '',
    `Changed paths: ${context.files.length ? context.files.map((file) => '`' + file + '`').join(', ') : '_none_'}`,
    '',
  ];

  if (!context.decisions.length) {
    lines.push('No recorded decisions apply to the changed files.', '');
    return lines.join('\n');
  }

  for (const decision of context.decisions) {
    const score = scoreDecision(decision);
    lines.push(`### ${decision.id}: ${decision.title}`, '', `Status: **${decision.status}**`, `Quality: ${score.score}/${score.total}`, '');
    if (decision.summary) lines.push(decision.summary.trim(), '');
    if (decision.decision) lines.push(`**Decision**: ${decision.decision.trim()}`, '');
    if (decision.consequences) lines.push(`**Consequences**: ${decision.consequences.trim()}`, '');
    if (decision.alternatives?.length) {
      lines.push('**Alternatives**', '');
      for (const alternative of decision.alternatives) {
        lines.push(`- ${alternative.name} (${alternative.verdict ?? 'unknown'})${alternative.reason ? `: ${alternative.reason}` : ''}`);
      }
      lines.push('');
    }
  }

  if (context.conflicts.length) {
    lines.push('### Conflicts', '');
    for (const conflict of context.conflicts) lines.push(`- ${conflict.level.toUpperCase()}: ${conflict.message}`);
    lines.push('');
  }

  if (context.audit.missing) {
    lines.push('### Missing evidence', '');
    for (const finding of context.audit.findings.filter((item) => item.status === 'missing')) {
      lines.push(`- ${finding.decisionId}/${finding.evidenceId}: ${finding.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}


