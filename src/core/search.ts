import type { Decision } from './types';

export interface SearchHit {
  decision: Decision;
  score: number;
  reason: string;
}

export function searchLedger(ledger: Decision[], query: string): SearchHit[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];
  for (const decision of ledger) {
    const haystack = [
      decision.id,
      decision.title,
      decision.summary,
      decision.context,
      decision.decision,
      decision.consequences,
      decision.kind,
      decision.owner,
      (decision.scope ?? []).join(' '),
      (decision.tags ?? []).join(' '),
      (decision.alternatives ?? []).map((a) => `${a.name} ${a.reason}`).join(' '),
      (decision.evidence ?? []).map((e) => `${e.title} ${e.value} ${e.note}`).join(' '),
      decision.body,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    let score = 0;
    let matched = 0;
    for (const term of terms) {
      if (haystack.includes(term)) {
        matched++;
        score += decision.title.toLowerCase().includes(term) ? 3 : 1;
        if (decision.id.toLowerCase().includes(term)) score += 2;
      }
    }
    if (matched > 0) {
      hits.push({ decision, score, reason: `${matched}/${terms.length} terms matched` });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.decision.id.localeCompare(b.decision.id));
}
