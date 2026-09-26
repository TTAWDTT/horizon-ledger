import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Decision, Evidence } from './types';

const execFileAsync = promisify(execFile);

export type EvidenceAuditStatus = 'verified' | 'missing' | 'external' | 'unverifiable' | 'error';

export interface EvidenceAudit {
  decisionId: string;
  evidenceId: string;
  type: Evidence['type'];
  value: string;
  status: EvidenceAuditStatus;
  message: string;
}

export interface LedgerAudit {
  verified: number;
  missing: number;
  external: number;
  unverifiable: number;
  findings: EvidenceAudit[];
}

export async function auditLedger(ledger: Decision[], root: string): Promise<LedgerAudit> {
  const findings: EvidenceAudit[] = [];
  for (const decision of ledger) {
    for (const evidence of decision.evidence ?? []) {
      findings.push(await auditEvidence(decision.id, evidence, root));
    }
  }
  return {
    verified: findings.filter((item) => item.status === 'verified').length,
    missing: findings.filter((item) => item.status === 'missing').length,
    external: findings.filter((item) => item.status === 'external').length,
    unverifiable: findings.filter((item) => item.status === 'unverifiable').length,
    findings,
  };
}

async function auditEvidence(decisionId: string, evidence: Evidence, root: string): Promise<EvidenceAudit> {
  if (!evidence.value?.trim()) {
    return result(decisionId, evidence, 'missing', 'missing evidence value');
  }

  const hash = await verifyHash(evidence, root);
  if (hash) return result(decisionId, evidence, hash.status, hash.message);

  if (isUrl(evidence.value)) {
    return result(decisionId, evidence, 'external', 'external URL is not fetched by local audit');
  }

  if (evidence.type === 'commit') {
    return auditCommit(decisionId, evidence, root);
  }

  if (['file', 'doc', 'test', 'benchmark'].includes(evidence.type)) {
    return auditPath(decisionId, evidence, root);
  }

  return result(decisionId, evidence, 'unverifiable', `${evidence.type} evidence has no deterministic local verifier`);
}

async function verifyHash(evidence: Evidence, root: string): Promise<{ status: EvidenceAuditStatus; message: string } | undefined> {
  if (!evidence.hash) return undefined;
  if (isUrl(evidence.value) || evidence.type === 'commit') {
    return { status: 'unverifiable', message: 'hash verification is supported for local file evidence only' };
  }
  const filePath = resolveLocalPath(root, evidence.value);
  try {
    const content = await fs.readFile(filePath);
    const actual = createHash('sha256').update(content).digest('hex');
    if (actual.toLowerCase() === evidence.hash.toLowerCase()) {
      return { status: 'verified', message: `sha256 verified: ${evidence.value}` };
    }
    return { status: 'missing', message: `sha256 mismatch: ${evidence.value}` };
  } catch {
    return { status: 'missing', message: `hash target not found: ${evidence.value}` };
  }
}

async function auditCommit(decisionId: string, evidence: Evidence, root: string): Promise<EvidenceAudit> {
  const sha = evidence.value.trim().replace(/[^a-f0-9]/gi, '');
  if (sha.length !== 40 && sha.length !== 64) {
    return result(decisionId, evidence, 'unverifiable', 'commit evidence must be a 40 or 64 character SHA');
  }
  try {
    await execFileAsync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root });
    return result(decisionId, evidence, 'verified', `commit exists: ${sha}`);
  } catch (error: any) {
    const message = String(error?.stderr ?? error?.message ?? '').toLowerCase();
    if (message.includes('not a git repository')) {
      return result(decisionId, evidence, 'unverifiable', 'commit evidence requires a Git repository');
    }
    return result(decisionId, evidence, 'missing', `commit not found: ${sha}`);
  }
}

async function auditPath(decisionId: string, evidence: Evidence, root: string): Promise<EvidenceAudit> {
  const filePath = resolveLocalPath(root, evidence.value);
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() && !stat.isDirectory()) {
      return result(decisionId, evidence, 'missing', `evidence target is not a file or directory: ${evidence.value}`);
    }
    return result(decisionId, evidence, 'verified', `${evidence.type} target exists: ${evidence.value}`);
  } catch {
    return result(decisionId, evidence, 'missing', `evidence target not found: ${evidence.value}`);
  }
}

function result(
  decisionId: string,
  evidence: Evidence,
  status: EvidenceAuditStatus,
  message: string,
): EvidenceAudit {
  return { decisionId, evidenceId: evidence.id, type: evidence.type, value: evidence.value, status, message };
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function resolveLocalPath(root: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}
