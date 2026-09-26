import type { Decision } from './types';

export interface ScoreResult {
  total: number;
  score: number;
  reasons: string[];
}

export function scoreDecision(d: Decision): ScoreResult {
  const reasons: string[] = [];
  let score = 0;
  if (d.summary?.trim()) {
    score += 1;
    reasons.push('summary');
  }
  if (d.context?.trim()) {
    score += 1;
    reasons.push('context');
  }
  if (d.decision?.trim()) {
    score += 2;
    reasons.push('decision');
  }
  if (d.consequences?.trim()) {
    score += 1;
    reasons.push('consequences');
  }
  if ((d.alternatives ?? []).length > 0) {
    score += 2;
    reasons.push('alternatives');
  }
  if ((d.evidence ?? []).length > 0) {
    score += 2;
    reasons.push('evidence');
  }
  if ((d.scope ?? []).length > 0) {
    score += 1;
    reasons.push('scope');
  }
  if (d.confidence && d.confidence !== 'low') {
    score += 1;
    reasons.push('confidence');
  }
  return { total: 11, score, reasons };
}
