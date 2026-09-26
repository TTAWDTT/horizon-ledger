import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Decision, Evidence } from './types';
import { commitReferencesDecision, commitTouchesScope, normalizeCommitSha, readCommit } from './commit';

const execFileAsync = promisify(execFile);

export type EvidenceAuditStatus = 'verified' | 'missing' | 'external' | 'unverifiable' | 'error';
export type CommitAttribution = 'scope' | 'message' | 'both' | 'none' | 'unavailable';

export interface EvidenceAudit {
  decisionId: string;
  evidenceId: string;
  type: Evidence['type'];
  value: string;
  status: EvidenceAuditStatus;
  message: string;
  sealed?: boolean;
  attribution?: CommitAttribution;
}

export interface LedgerAudit {
  verified: number;
  missing: number;
  external: number;
  unverifiable: number;
  sealed: number;
  attributed: number;
  findings: EvidenceAudit[];
}

export async function auditLedger(ledger: Decision[], root: string): Promise<LedgerAudit> {
  const findings: EvidenceAudit[] = [];
  for (const decision of ledger) {
    for (const evidence of decision.evidence ?? []) {
      findings.push(await auditEvidence(decision, evidence, root));
    }
  }
  return {
    verified: findings.filter((item) => item.status === 'verified').length,
    missing: findings.filter((item) => item.status === 'missing').length,
    external: findings.filter((item) => item.status === 'external').length,
    sealed: findings.filter((item) => item.status === 'verified' && item.sealed).length,
    attributed: findings.filter((item) => isAttributed(item)).length,
    unverifiable: findings.filter((item) => item.status === 'unverifiable').length,
    findings,
  };
}

async function auditEvidence(decision: Decision, evidence: Evidence, root: string): Promise<EvidenceAudit> {
  if (!evidence.value?.trim()) {
    return result(decision.id, evidence, 'missing', 'missing evidence value');
  }

  const hash = await verifyHash(evidence, root);
  if (hash) return result(decision.id, evidence, hash.status, hash.message, hash.sealed, hash.attribution);

  if (isUrl(evidence.value)) {
    return result(decision.id, evidence, 'external', 'external URL is not fetched by local audit');
  }

  if (evidence.type === 'commit') {
    return auditCommit(decision, evidence, root);
  }

  if (['file', 'doc', 'test', 'benchmark'].includes(evidence.type)) {
    return auditPath(decision.id, evidence, root);
  }

  return result(decision.id, evidence, 'unverifiable', `${evidence.type} evidence has no deterministic local verifier`);
}

async function verifyHash(evidence: Evidence, root: string): Promise<{ status: EvidenceAuditStatus; message: string; sealed?: boolean; attribution?: CommitAttribution } | undefined> {
  if (!evidence.hash) return undefined;
  if (isUrl(evidence.value) || evidence.type === 'commit') {
    return { status: 'unverifiable', message: 'hash verification is supported for local file evidence only' };
  }
  const filePath = resolveLocalPath(root, evidence.value);
  try {
    const content = await fs.readFile(filePath);
    const actual = createHash('sha256').update(content).digest('hex');
    if (actual.toLowerCase() === evidence.hash.toLowerCase()) {
      return { status: 'verified', message: `sha256 verified: ${evidence.value}`, sealed: true };
    }
    return { status: 'missing', message: `sha256 mismatch: ${evidence.value}` };
  } catch {
    return { status: 'missing', message: `hash target not found: ${evidence.value}` };
  }
}

async function auditCommit(decision: Decision, evidence: Evidence, root: string): Promise<EvidenceAudit> {
  const sha = normalizeCommitSha(evidence.value);
  if (!sha) {
    return result(decision.id, evidence, 'unverifiable', 'commit evidence must be a 40 or 64 character SHA');
  }
  try {
    await execFileAsync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root });
    const commit = await readCommit(root, sha);
    if (!commit) {
      return result(decision.id, evidence, 'verified', `commit exists but could not be inspected: ${sha}`, true, 'unavailable');
    }
    const touchesScope = commitTouchesScope(commit, decision.scope ?? []);
    const referencesId = commitReferencesDecision(commit, decision.id);
    const attribution: CommitAttribution = touchesScope && referencesId ? 'both' : touchesScope ? 'scope' : referencesId ? 'message' : 'none';
    const attributionMessage = attribution === 'both'
      ? 'commit touches decision scope and references its id'
      : attribution === 'scope'
        ? 'commit touches decision scope'
        : attribution === 'message'
          ? 'commit message references decision id'
          : 'commit exists but is not attributed to this decision';
    return result(decision.id, evidence, 'verified', `commit exists: ${sha} (${attributionMessage})`, true, attribution);
  } catch (error: any) {
    const message = String(error?.stderr ?? error?.message ?? '').toLowerCase();
    if (message.includes('not a git repository')) {
      return result(decision.id, evidence, 'unverifiable', 'commit evidence requires a Git repository');
    }
    return result(decision.id, evidence, 'missing', `commit not found: ${sha}`);
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
  sealed = false,
  attribution?: CommitAttribution,
): EvidenceAudit {
  return {
    decisionId,
    evidenceId: evidence.id,
    type: evidence.type,
    value: evidence.value,
    status,
    message,
    sealed,
    attribution,
  };
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function resolveLocalPath(root: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}


export function isAttributed(finding: EvidenceAudit): boolean {
  return finding.status === 'verified'
    && (finding.attribution === 'scope' || finding.attribution === 'message' || finding.attribution === 'both');
}

