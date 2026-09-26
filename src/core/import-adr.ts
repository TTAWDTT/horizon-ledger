import fs from 'node:fs/promises';
import path from 'node:path';
import type { Alternative, DecisionStatus, Evidence } from './types';
import { createDecision, readLedger, initLedger, addEvidence, addAlternative } from './ledger';
import { parseFrontMatter } from './frontmatter';
import { slugify } from './utils';

export interface AdrImportOptions {
  dryRun?: boolean;
  status?: DecisionStatus;
  sourceRoot?: string;
}

export interface AdrImportResult {
  file: string;
  title: string;
  id?: string;
  action: 'created' | 'dry-run' | 'skipped';
  reason?: string;
}

export interface AdrImportReport {
  scanned: number;
  created: number;
  skipped: number;
  results: AdrImportResult[];
}

export async function importAdrDirectory(root: string, sourceDir: string, options: AdrImportOptions = {}): Promise<AdrImportReport> {
  await initLedger(root);
  const dir = path.resolve(sourceDir);
  const entries = (await fs.readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md') && entry.name.toLowerCase() !== 'readme.md')
    .map((entry) => entry.name)
    .sort();

  const ledger = await readLedger(root);
  const results: AdrImportResult[] = [];
  let created = 0;
  let skipped = 0;

  for (const fileName of entries) {
    const filePath = path.join(dir, fileName);
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = parseFrontMatter(raw);
    const title = parsed.data.title || extractH1(parsed.body) || humanizeFileName(fileName);
    const evidenceValue = relativeFile(root, filePath, options.sourceRoot);
    const existing = ledger.find((decision) =>
      decision.title === title ||
      (decision.evidence ?? []).some((item) => item.value === evidenceValue),
    );
    if (existing) {
      skipped++;
      results.push({ file: evidenceValue, title, id: existing.id, action: 'skipped', reason: 'already imported' });
      continue;
    }

    const context = extractSection(parsed.body, ['context', 'context and problem statement', 'problem']) ?? '';
    const decision = extractSection(parsed.body, ['decision', 'decision outcome', 'chosen option']) ?? '';
    const consequences = extractSection(parsed.body, ['consequences', 'positive consequences', 'negative consequences']) ?? '';
    const summary = extractSection(parsed.body, ['summary']) ?? firstParagraph(decision || context || parsed.body);
    const status = options.status ?? normalizeStatus(extractSection(parsed.body, ['status']) ?? '', decision);
    const alternatives = extractAlternatives(parsed.body);
    const links = extractLinks(parsed.body);
    const evidence: Array<Omit<Evidence, 'id'>> = [
      {
        type: 'doc',
        value: evidenceValue,
        title: 'Imported ADR',
        strength: 'strong',
        note: 'Original architecture decision record preserved in the repository.',
      },
    ];

    if (options.dryRun) {
      results.push({ file: evidenceValue, title, action: 'dry-run' });
      continue;
    }

    for (const link of links) {
      evidence.push({
        type: 'link',
        value: link.value,
        title: link.title,
        strength: 'moderate',
        note: 'Linked from the original ADR.',
      });
    }

    const createdDecision = await createDecision(root, {
      title,
      status,
      summary,
      context,
      decision,
      consequences,
      tags: ['adr', 'imported'],
    });

    let updatedDecision = createdDecision;
    for (const alternative of alternatives) {
      const result = await addAlternative(root, updatedDecision.id, alternative);
      if (result) updatedDecision = result;
    }

    for (const item of evidence) {
      const result = await addEvidence(root, updatedDecision.id, item);
      if (result) updatedDecision = result;
    }

    created++;
    results.push({ file: evidenceValue, title, id: updatedDecision.id, action: 'created' });
  }

  return { scanned: entries.length, created, skipped, results };
}

function extractH1(body: string): string | undefined {
  return body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line))
    ?.replace(/^#\s+/, '')
    .trim() || undefined;
}

function extractSection(body: string, aliases: string[]): string | undefined {
  const lines = body.split('\n');
  const normalizedAliases = aliases.map((alias) => alias.trim().toLowerCase());
  let collecting = false;
  let level = 0;
  const collected: string[] = [];
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      if (collecting && heading[1].length <= level) break;
      const headingText = heading[2].trim().toLowerCase();
      if (!collecting && normalizedAliases.includes(headingText)) {
        collecting = true;
        level = heading[1].length;
      }
      continue;
    }
    if (collecting) collected.push(line);
  }
  return collected.join('\n').trim() || undefined;
}


function extractAlternatives(body: string): Array<Omit<Alternative, 'id'>> {
  const section = extractSection(body, ['considered options', 'alternatives', 'options']);
  if (!section) return [];

  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => {
      const text = line.replace(/^[-*]\s+/, '').trim();
      const bold = text.match(/^\*\*(.+?)\*\*\s*:\s*(.*)$/);
      if (bold) {
        return { name: bold[1].trim(), verdict: 'unknown' as const, reason: bold[2].trim() };
      }
      const [name, reason] = text.split(/:\s+/, 2);
      return {
        name: name?.trim() || 'Considered option',
        verdict: 'unknown' as const,
        reason: reason?.trim(),
      };
    })
    .filter((item) => item.name.length > 0);
}

function extractLinks(body: string): Array<{ title: string; value: string }> {
  const links: Array<{ title: string; value: string }> = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body))) {
    links.push({ title: match[1].trim(), value: match[2].trim() });
  }
  return links;
}

function normalizeStatus(value: string, decision: string): DecisionStatus {
  const text = value.toLowerCase();
  if (text.includes('superseded')) return 'superseded';
  if (text.includes('rejected')) return 'rejected';
  if (text.includes('proposed')) return 'proposed';
  return decision.trim() ? 'decided' : 'draft';
}

function firstParagraph(body: string): string {
  return body
    .replace(/^#{1,6}\s+.*$/gm, '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .find((paragraph) => paragraph.length > 0) ?? '';
}

function humanizeFileName(fileName: string): string {
  return slugify(fileName.replace(/\.md$/i, ''))
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function relativeFile(root: string, filePath: string, sourceRoot?: string): string {
  const from = sourceRoot ? path.resolve(sourceRoot) : root;
  return path.relative(from, filePath).replace(/\\/g, '/');
}
