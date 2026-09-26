import type { Alternative, Decision } from './types';

export type ConflictKind =
  | 'contradictory_verdict'
  | 'dangling_supersession'
  | 'superseded_without_link'
  | 'target_not_superseded';

export interface ConflictDiagnostic {
  level: 'error' | 'warn';
  kind: ConflictKind;
  id?: string;
  related: string[];
  subject?: string;
  message: string;
}

export function findConflicts(ledger: Decision[]): ConflictDiagnostic[] {
  const conflicts: ConflictDiagnostic[] = [];
  const byId = new Map(ledger.map((d) => [d.id, d]));

  for (let i = 0; i < ledger.length; i++) {
    for (let j = i + 1; j < ledger.length; j++) {
      const a = ledger[i];
      const b = ledger[j];
      if (!scopesOverlap(a.scope ?? [], b.scope ?? [])) continue;

      const alternativesA = a.alternatives ?? [];
      const alternativesB = b.alternatives ?? [];
      for (const left of alternativesA) {
        const right = alternativesB.find(
          (candidate) => normalizeName(candidate.name) === normalizeName(left.name),
        );
        if (!left.name || !right?.name) continue;
        const opposite =
          (left.verdict === 'accepted' && right.verdict === 'rejected') ||
          (left.verdict === 'rejected' && right.verdict === 'accepted');
        if (!opposite) continue;

        conflicts.push({
          level: 'error',
          kind: 'contradictory_verdict',
          id: a.id,
          related: [b.id],
          subject: left.name,
          message: `"${left.name}" is ${left.verdict} in ${a.id} and ${right.verdict} in ${b.id} within overlapping scopes`,
        });
      }
    }
  }

  for (const d of ledger) {
    if (d.status !== 'superseded') continue;
    const hasIncoming = ledger.some((other) =>
      (other.links ?? []).some((link) => link.type === 'supersedes' && link.id === d.id),
    );
    if (!hasIncoming) {
      conflicts.push({
        level: 'warn',
        kind: 'superseded_without_link',
        id: d.id,
        related: [],
        message: `${d.id} is superseded but no decision links to it with supersedes`,
      });
    }
  }

  for (const d of ledger) {
    for (const link of d.links ?? []) {
      if (link.type !== 'supersedes') continue;
      const target = byId.get(link.id);
      if (!target) {
        conflicts.push({
          level: 'error',
          kind: 'dangling_supersession',
          id: d.id,
          related: [link.id],
          message: `${d.id} supersedes ${link.id}, but ${link.id} does not exist`,
        });
        continue;
      }
      if (target.status !== 'superseded') {
        conflicts.push({
          level: 'warn',
          kind: 'target_not_superseded',
          id: target.id,
          related: [d.id],
          message: `${d.id} supersedes ${target.id}, but ${target.id} is still ${target.status}`,
        });
      }
    }
  }

  return conflicts;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function scopesOverlap(left: string[], right: string[]): boolean {
  for (const leftScope of left) {
    for (const rightScope of right) {
      const a = normalizeScope(leftScope);
      const b = normalizeScope(rightScope);
      if (!a || !b) continue;
      if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) return true;
    }
  }
  return false;
}

function normalizeScope(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '');
}
