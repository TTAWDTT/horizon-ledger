import path from 'node:path';
import { readLedger } from './ledger';
import { listChangedFiles } from './pr-context';
import { decisionsForFile } from './relevance';
import { auditLedger, type LedgerAudit } from './audit';
import { findConflicts, type ConflictDiagnostic } from './conflicts';
import { validateLedger, type Diagnostic } from './validate';
import { scoreDecision } from './score';
import type { Decision, DecisionPolicy } from './types';

export type GateVerdict = 'pass' | 'warn' | 'block';

export interface GateViolation {
  level: 'error' | 'warn';
  decisionId?: string;
  file?: string;
  message: string;
}

export interface ChangeGate {
  version: 1;
  root: string;
  files: string[];
  decisions: Decision[];
  coverage: {
    governed: number;
    unguarded: number;
  };
  conflicts: ConflictDiagnostic[];
  audit: LedgerAudit;
  diagnostics: Diagnostic[];
  violations: GateViolation[];
  verdict: GateVerdict;
}

export async function buildChangeGate(root: string, files: string[]): Promise<ChangeGate> {
  const resolvedRoot = path.resolve(root);
  const ledger = await readLedger(resolvedRoot);
  const byId = new Map<string, Decision>();
  const governedFiles = new Set<string>();

  for (const file of files) {
    const relevant = decisionsForFile(ledger, file);
    if (relevant.length) governedFiles.add(file);
    for (const decision of relevant) byId.set(decision.id, decision);
  }

  const unique = [...byId.values()];
  const audit = await auditLedger(unique, resolvedRoot);
  const conflicts = findConflicts(unique);
  const diagnostics = validateLedger(unique);
  const violations: GateViolation[] = [];

  for (const decision of unique) {
    if (!decision.policy || (decision.policy.mode ?? 'review') === 'observe') continue;

    const level = (decision.policy.mode ?? 'review') === 'block' ? 'error' : 'warn';
    const requireEvidence = decision.policy.requireEvidence ?? 'verified';

    if (decision.status !== 'decided') {
      violations.push({
        level,
        decisionId: decision.id,
        message: `${decision.id} is ${decision.status}, not decided`,
      });
    }

    const findings = audit.findings.filter((finding) => finding.decisionId === decision.id);
    const attachedCount = decision.evidence?.length ?? 0;
    if (!attachedCount) {
      violations.push({
        level,
        decisionId: decision.id,
        message: `${decision.id} has no attached evidence`,
      });
    }
    if (requireEvidence !== 'any') {
      const acceptable = findings.filter((finding) => finding.status === 'verified');
      const strongOk = decision.evidence?.some((evidence) =>
        evidence.strength === 'strong' &&
        findings.some((finding) => finding.evidenceId === evidence.id && finding.status === 'verified'),
      );
      if (requireEvidence === 'strong' && !strongOk) {
        violations.push({
          level,
          decisionId: decision.id,
          message: `${decision.id} has no verified strong evidence`,
        });
      } else if (requireEvidence === 'verified' && !acceptable.length) {
        violations.push({
          level,
          decisionId: decision.id,
          message: `${decision.id} has no verified evidence`,
        });
      }
    }

    if (findings.some((finding) => finding.status === 'missing')) {
      violations.push({
        level,
        decisionId: decision.id,
        message: `${decision.id} has missing evidence`,
      });
    }
  }

  if (conflicts.some((conflict) => conflict.level === 'error') && unique.some((d) => (d.policy?.mode ?? 'observe') === 'block')) {
    violations.push({
      level: 'error',
      message: 'A blocking policy applies while the governed decisions have errors',
    });
  }

  const verdict: GateVerdict = violations.some((item) => item.level === 'error')
    ? 'block'
    : violations.some((item) => item.level === 'warn') ? 'warn' : 'pass';

  return {
    version: 1,
    root: resolvedRoot,
    files,
    decisions: unique,
    coverage: {
      governed: governedFiles.size,
      unguarded: files.length - governedFiles.size,
    },
    conflicts,
    audit,
    diagnostics,
    violations,
    verdict,
  };
}

export async function buildPullRequestGate(
  root: string,
  base: string,
  head: string,
  files?: string[],
): Promise<ChangeGate> {
  const changed = files ?? await listChangedFiles(root, base, head);
  return buildChangeGate(root, changed);
}

export function changeGateMarkdown(gate: ChangeGate): string {
  const lines = [
    '# Horizon change gate',
    '',
    `Verdict: **${gate.verdict.toUpperCase()}**`,
    `Changed paths: ${gate.files.length}`,
    `Governed paths: ${gate.coverage.governed}`,
    `Unguarded paths: ${gate.coverage.unguarded}`,
    '',
  ];

  if (!gate.decisions.length) {
    lines.push('No policy-governed decisions apply to the changed paths.', '');
  }

  for (const decision of gate.decisions) {
    const score = scoreDecision(decision);
    const mode = decision.policy?.mode ?? 'observe';
    lines.push(
      `## ${decision.id}: ${decision.title}`,
      '',
      `Status: ${decision.status}`,
      `Policy: ${mode}`,
      `Evidence requirement: ${decision.policy?.requireEvidence ?? 'none'}`,
      `Quality: ${score.score}/${score.total}`,
      '',
    );
    if (decision.decision) lines.push(`**Decision**: ${decision.decision.trim()}`, '');
  }

  if (gate.violations.length) {
    lines.push('## Gate findings', '');
    for (const violation of gate.violations) {
      lines.push(`- ${violation.level.toUpperCase()}: ${violation.message}`);
    }
    lines.push('');
  }

  if (gate.audit.missing) {
    lines.push('## Missing evidence', '');
    for (const finding of gate.audit.findings.filter((item) => item.status === 'missing')) {
      lines.push(`- ${finding.decisionId}/${finding.evidenceId}: ${finding.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}





