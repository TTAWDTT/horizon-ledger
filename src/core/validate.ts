import type { Decision } from './types';
import { findConflicts, type ConflictDiagnostic } from './conflicts';

export interface Diagnostic {
  level: 'error' | 'warn';
  id?: string;
  message: string;
  kind?: string;
  related?: string[];
  subject?: string;
}

export function validateLedger(ledger: Decision[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const d of ledger) {
    if (!d.title?.trim()) diagnostics.push({ level: 'error', id: d.id, message: 'missing title' });
    if (!d.summary?.trim()) diagnostics.push({ level: 'warn', id: d.id, message: 'missing summary' });
    if (!d.context?.trim()) diagnostics.push({ level: 'warn', id: d.id, message: 'missing context' });
    if (!d.decision?.trim()) diagnostics.push({ level: 'error', id: d.id, message: 'missing decision' });
    if (!d.consequences?.trim()) diagnostics.push({ level: 'warn', id: d.id, message: 'missing consequences' });
    if ((d.alternatives ?? []).length === 0) diagnostics.push({ level: 'warn', id: d.id, message: 'missing alternatives' });
    if ((d.evidence ?? []).length === 0) diagnostics.push({ level: 'warn', id: d.id, message: 'missing evidence' });
  }
  return [...diagnostics, ...findConflicts(ledger)];
}

export { findConflicts };
export type { ConflictDiagnostic };
