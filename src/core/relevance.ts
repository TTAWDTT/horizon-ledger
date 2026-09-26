import type { Decision } from './types';

export function decisionsForFile(ledger: Decision[], filePath: string): Decision[] {
  const normalized = normalizePath(filePath);
  return ledger.filter((d) => {
    const scopes = d.scope ?? [];
    if (!scopes.length) return false;
    return scopes.some((s) => {
      const scope = normalizePath(s);
      if (!scope) return false;
      return normalized === scope || normalized.startsWith(`${scope}/`);
    });
  });
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '');
}
