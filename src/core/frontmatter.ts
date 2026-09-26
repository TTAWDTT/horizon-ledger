import { parse, stringify } from 'yaml';

export function parseFrontMatter(raw: string): { data: any; body: string } {
  const normalized = raw.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: normalized };
  return { data: parse(match[1]) ?? {}, body: (match[2] ?? '').trimStart() };
}

export function encodeFrontMatter(data: any, body: string): string {
  const yaml = stringify(data, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body.trim()}\n`;
}
