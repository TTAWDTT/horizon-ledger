import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommitInfo {
  sha: string;
  shortSha: string;
  subject: string;
  body: string;
  parents: string[];
  files: string[];
}

export function normalizePath(value: string): string {
  return value.replace(/\\/gu, '/').replace(/^\.?\//u, '').replace(/\/+$/u, '');
}

export function pathMatchesScope(filePath: string, scopes: string[] = []): boolean {
  const file = normalizePath(filePath);
  if (!file) return false;
  return scopes.some((scope) => {
    const normalized = normalizePath(scope);
    if (!normalized) return false;
    return file === normalized || file.startsWith(`${normalized}/`);
  });
}

export function commitTouchesScope(commit: CommitInfo, scopes: string[] = []): boolean {
  return commit.files.some((file) => pathMatchesScope(file, scopes));
}

export function commitReferencesDecision(commit: CommitInfo, decisionId: string): boolean {
  if (!decisionId.trim()) return false;
  const pattern = new RegExp(`(?<![A-Za-z0-9-])${escapeRegExp(decisionId.trim())}(?![A-Za-z0-9-])`, 'u');
  return pattern.test(commit.subject) || pattern.test(commit.body);
}

export function normalizeCommitSha(value: string): string | undefined {
  const sha = value.trim().replace(/^sha256:/iu, '').replace(/[^a-f0-9]/giu, '').toLowerCase();
  return sha.length === 40 || sha.length === 64 ? sha : undefined;
}

export async function readCommit(root: string, sha: string): Promise<CommitInfo | undefined> {
  const shaOnly = normalizeCommitSha(sha);
  if (!shaOnly) return undefined;
  try {
    const { stdout } = await execFileAsync('git', [
      'show', '--no-renames', '--name-only', '--format=%H%x1f%s%x1f%b%x1f%P%x1e', shaOnly,
    ], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
    return parseCommitLog(stdout)[0];
  } catch {
    return undefined;
  }
}

export async function listCommits(root: string, base: string, head: string): Promise<CommitInfo[]> {
  assertGitRef(base, 'base');
  assertGitRef(head, 'head');
  const { stdout } = await execFileAsync('git', [
    'log', '--reverse', '--no-renames', '--name-only', '--format=%H%x1f%s%x1f%b%x1f%P%x1e', `${base}..${head}`, '--',
  ], { cwd: root, maxBuffer: 50 * 1024 * 1024 });
  return parseCommitLog(stdout);
}

function parseCommitLog(raw: string): CommitInfo[] {
  const chunks = raw.split('\u001e');
  const commits: CommitInfo[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/u)
      .map((line) => line.replace(/\r$/u, ''))
      .filter((line) => line.length > 0);
    const headerIndex = commits.length ? lines.findIndex(isCommitHeader) : 0;

    if (commits.length) {
      const previousFiles = headerIndex >= 0 ? lines.slice(0, headerIndex) : lines;
      if (previousFiles.length) commits[commits.length - 1].files.push(...previousFiles);
    }

    if (commits.length && headerIndex < 0) continue;
    const commit = parseCommitHeader(lines[headerIndex]);
    if (!commit) continue;
    commits.push(commit);
  }

  return commits;
}

function isCommitHeader(line: string): boolean {
  return /^[a-f0-9]{40}(?:[a-f0-9]{24})?\u001f/u.test(line);
}

function parseCommitHeader(header: string): CommitInfo | undefined {
  const first = header.indexOf('\u001f');
  const second = header.indexOf('\u001f', first + 1);
  const third = header.indexOf('\u001f', second + 1);
  if (first < 0 || second < 0 || third < 0) return undefined;
  const sha = header.slice(0, first).trim().toLowerCase();
  if (!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/u.test(sha)) return undefined;
  const subject = header.slice(first + 1, second).trim();
  const body = header.slice(second + 1, third).trim();
  const parents = header.slice(third + 1).trim().split(/\s+/u).filter(Boolean);
  return { sha, shortSha: sha.slice(0, 12), subject, body, parents, files: [] };
}

function assertGitRef(value: string, label: string): void {
  if (!value.trim() || value.startsWith('-')) throw new Error(`Invalid ${label} ref: ${value}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
