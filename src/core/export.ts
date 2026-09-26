import type { Decision } from './types';
import { buildGraph } from './graph';
import { scoreDecision } from './score';
import { validateLedger } from './validate';

export interface LedgerExport {
  version: number;
  ledger: Decision[];
  graph: ReturnType<typeof buildGraph>;
  diagnostics: ReturnType<typeof validateLedger>;
  scores: Array<{ id: string; title: string; score: ReturnType<typeof scoreDecision> }>;
}

export function exportLedger(ledger: Decision[]): LedgerExport {
  return {
    version: 1,
    ledger,
    graph: buildGraph(ledger),
    diagnostics: validateLedger(ledger),
    scores: ledger.map((d) => ({ id: d.id, title: d.title, score: scoreDecision(d) })),
  };
}

export function exportMarkdown(ledger: Decision[]): string {
  return ledger
    .map((d) => {
      const score = scoreDecision(d);
      return [
        `## ${d.id}: ${d.title}`,
        '',
        `Status: ${d.status}`,
        `Score: ${score.score}/${score.total}`,
        '',
        d.summary?.trim() ? `**Summary**\n\n${d.summary.trim()}` : '',
        d.decision?.trim() ? `**Decision**\n\n${d.decision.trim()}` : '',
        d.consequences?.trim() ? `**Consequences**\n\n${d.consequences.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
    })
    .join('\n\n---\n\n');
}
