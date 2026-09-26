import type { Alternative, Evidence } from './types';

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

export function nextId(items: { id: string }[]): string {
  const nums = items.map((i) => Number.parseInt(i.id.replace(/[^0-9]/g, ''), 10)).filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `D-${String(next).padStart(4, '0')}`;
}

export function newEvidenceId(items: Evidence[] | undefined): string {
  const nums = (items ?? []).map((e) => Number.parseInt(e.id.replace(/[^0-9]/g, ''), 10)).filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `E-${String(next).padStart(3, '0')}`;
}

export function newAlternativeId(items: Alternative[] | undefined): string {
  const nums = (items ?? []).map((e) => Number.parseInt(e.id.replace(/[^0-9]/g, ''), 10)).filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `A-${String(next).padStart(3, '0')}`;
}
