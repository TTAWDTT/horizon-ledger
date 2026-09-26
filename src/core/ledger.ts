import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFrontMatter, encodeFrontMatter } from './frontmatter';
import type { Decision, DecisionLink, DecisionStatus, Evidence } from './types';
import { slugify, nextId, newEvidenceId } from './utils';

export interface LedgerConfig {
  version: number;
  name?: string;
  description?: string;
}

export function ledgerDir(root: string): string {
  return path.resolve(root, '.horizon');
}

export function decisionsDir(root: string): string {
  return path.join(ledgerDir(root), 'decisions');
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function initLedger(root: string): Promise<void> {
  const dir = ledgerDir(root);
  const dec = decisionsDir(root);
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(dec, { recursive: true });
  const configPath = path.join(dir, 'config.json');
  if (!(await exists(configPath))) {
    const config: LedgerConfig = { version: 1 };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }
}

export async function readLedger(root: string): Promise<Decision[]> {
  const dir = decisionsDir(root);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const files = entries.filter((f) => f.endsWith('.md')).sort();
  const decisions: Decision[] = [];
  for (const file of files) {
    const p = path.join(dir, file);
    try {
      const decision = await readDecisionFile(p);
      decisions.push(decision);
    } catch (err) {
      console.warn(`Skipped unreadable decision file: ${file}`);
    }
  }
  return decisions.sort((a, b) => a.id.localeCompare(b.id));
}

export async function readDecisionFile(filePath: string): Promise<Decision> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = parseFrontMatter(raw);
  const data = parsed.data as Decision;
  if (!data || typeof data.id !== 'string' || typeof data.title !== 'string') {
    throw new Error(`Invalid decision file: ${filePath}`);
  }
  return {
    ...data,
    summary: extractSection(parsed.body, 'summary') || data.summary,
    context: extractSection(parsed.body, 'context') || data.context,
    decision: extractSection(parsed.body, 'decision') || data.decision,
    consequences: extractSection(parsed.body, 'consequences') || data.consequences,
    body: parsed.body.trim(),
  };
}

export async function createDecision(root: string, input: Partial<Decision> & { title: string }): Promise<Decision> {
  await initLedger(root);
  const dir = decisionsDir(root);
  const now = new Date().toISOString();
  const existing = await readLedger(root);
  const id = input.id || nextId(existing);
  const base: Decision = {
    id,
    title: input.title,
    status: (input.status ?? 'draft') as DecisionStatus,
    createdAt: now,
    updatedAt: now,
    confidence: input.confidence ?? 'medium',
    horizon: input.horizon ?? 'medium',
    kind: input.kind ?? 'engineering',
    scope: input.scope ?? [],
    tags: input.tags ?? [],
    owner: input.owner,
    alternatives: input.alternatives ?? [],
    evidence: input.evidence ?? [],
    links: input.links ?? [],
    summary: input.summary ?? '',
    context: input.context ?? '',
    decision: input.decision ?? '',
    consequences: input.consequences ?? '',
  };
  const file = path.join(dir, `${slugify(baseName(base))}.md`);
  const content = encodeFrontMatter(toFront(base), renderBody(base));
  await fs.writeFile(file, content, 'utf8');
  return base;
}

export async function updateDecision(root: string, id: string, patch: Partial<Decision>): Promise<Decision | undefined> {
  const all = await readLedger(root);
  const found = all.find((d) => d.id === id);
  if (!found) return undefined;
  const file = await decisionFilePath(root, found.id);
  const patchEntries = Object.entries(patch).filter(([, value]) => value !== undefined);
  const merged = { ...found, ...Object.fromEntries(patchEntries), updatedAt: new Date().toISOString() } as Decision;
  const content = encodeFrontMatter(toFront(merged), renderBody(merged));
  await fs.writeFile(file, content, 'utf8');
  return merged;
}


export async function addLink(root: string, id: string, link: DecisionLink): Promise<Decision | undefined> {
  const all = await readLedger(root);
  const found = all.find((d) => d.id === id);
  if (!found) return undefined;
  const links = found.links ?? [];
  if (links.some((l) => l.id === link.id && l.type === link.type)) {
    return found;
  }
  const updated = { ...found, links: [...(found.links ?? []), link], updatedAt: new Date().toISOString() };
  const file = await decisionFilePath(root, found.id);
  const content = encodeFrontMatter(toFront(updated), renderBody(updated));
  await fs.writeFile(file, content, 'utf8');
  return updated;
}

export async function addEvidence(root: string, id: string, input: Omit<Evidence, 'id'>): Promise<Decision | undefined> {
  const all = await readLedger(root);
  const found = all.find((d) => d.id === id);
  if (!found) return undefined;
  const evidence = found.evidence ?? [];
  const newEvidence: Evidence = { ...input, id: newEvidenceId(evidence) };
  const updated = { ...found, evidence: [...(found.evidence ?? []), newEvidence], updatedAt: new Date().toISOString() };
  const file = await decisionFilePath(root, found.id);
  const content = encodeFrontMatter(toFront(updated), renderBody(updated));
  await fs.writeFile(file, content, 'utf8');
  return updated;
}

async function decisionFilePath(root: string, id: string): Promise<string> {
  const dir = decisionsDir(root);
  const entries = await fs.readdir(dir);
  for (const file of entries.filter((f) => f.endsWith('.md'))) {
    const p = path.join(dir, file);
    const raw = await fs.readFile(p, 'utf8');
    try {
      const parsed = parseFrontMatter(raw);
      if (parsed.data?.id === id) return p;
    } catch {
      // ignore malformed file during lookup
    }
  }
  return path.join(dir, `${slugify(id.toLowerCase())}.md`);
}

function baseName(d: Decision): string {
  return `${d.id.toLowerCase()}-${slugify(d.title)}`;
}

function toFront(d: Decision): any {
  return {
    id: d.id,
    title: d.title,
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    confidence: d.confidence,
    horizon: d.horizon,
    kind: d.kind,
    scope: d.scope,
    tags: d.tags,
    owner: d.owner,
    links: d.links,
    alternatives: d.alternatives,
    evidence: d.evidence,
  };
}

function renderBody(d: Decision): string {
  const sections = [
    ['Summary', d.summary],
    ['Context', d.context],
    ['Decision', d.decision],
    ['Consequences', d.consequences],
  ] as const;
  return (
    sections
      .filter(([, text]) => text && String(text).trim())
      .map(([heading, text]) => `## ${heading}\n\n${text}\n`)
      .join('\n')
      .trimEnd() + '\n'
  );
}

function extractSection(body: string, name: string): string | undefined {
  const lines = body.split('\n');
  let collecting = false;
  const collected: string[] = [];
  for (const line of lines) {
    if (collecting) {
      if (line.startsWith('## ')) break;
      collected.push(line);
      continue;
    }
    if (line.toLowerCase() === `## ${name.toLowerCase()}`) {
      collecting = true;
    }
  }
  return collected.join('\n').trim() || undefined;
}
