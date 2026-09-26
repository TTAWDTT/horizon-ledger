import { gateDigestFor } from './report';
import { sha256Id, stableStringify } from './hash';
import { HORIZON_VERSION } from '../version';
import type { ChangeGate, GateViolation } from './policy';
import type { WorkspaceChangeGate } from './workspace';
import type { Diagnostic } from './validate';

export const SARIF_VERSION = '2.1.0';
export const SARIF_SCHEMA = 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';
export const HORIZON_SARIF_DRIVER_NAME = 'Horizon Ledger';
export const HORIZON_SARIF_INFORMATION_URI = 'https://github.com/TTAWDTT/horizon-ledger';

export type SarifLevel = 'error' | 'warning' | 'note';

export interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  defaultConfiguration: { level: SarifLevel };
}

export interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: { text: string };
  locations?: Array<{ physicalLocation: { artifactLocation: { uri: string } } }>;
  partialFingerprints: { horizonFinding: string };
  properties?: Record<string, unknown>;
}

export interface SarifRun {
  tool: {
    driver: {
      name: typeof HORIZON_SARIF_DRIVER_NAME;
      version: string;
      informationUri: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
  properties: Record<string, unknown>;
}

export interface HorizonSarif {
  $schema: typeof SARIF_SCHEMA;
  version: typeof SARIF_VERSION;
  runs: [SarifRun];
}

type GateLike = ChangeGate | WorkspaceChangeGate;

const ruleDescriptions: Record<string, { title: string; detail: string; level: SarifLevel }> = {
  'horizon/undecided': {
    title: 'Undecided governed change',
    detail: 'A decision governing the changed path is not in the decided state.',
    level: 'error',
  },
  'horizon/no-attached-evidence': {
    title: 'Missing attached evidence',
    detail: 'A decision governing the changed path has no attached evidence.',
    level: 'warning',
  },
  'horizon/no-strong-evidence': {
    title: 'Missing strong evidence',
    detail: 'A decision governing the changed path requires verified strong evidence.',
    level: 'error',
  },
  'horizon/no-sealed-evidence': {
    title: 'Missing sealed evidence',
    detail: 'A decision governing the changed path requires hash-sealed evidence.',
    level: 'error',
  },
  'horizon/no-verified-evidence': {
    title: 'Missing verified evidence',
    detail: 'A decision governing the changed path requires locally verified evidence.',
    level: 'error',
  },
  'horizon/missing-evidence': {
    title: 'Missing evidence target',
    detail: 'Evidence attached to a decision governing the changed path could not be found.',
    level: 'error',
  },
  'horizon/conflicting-decisions': {
    title: 'Conflicting governed decisions',
    detail: 'A blocking policy applies while governed decisions have conflicts or validation errors.',
    level: 'error',
  },
  'horizon/diagnostic': {
    title: 'Horizon diagnostic',
    detail: 'A Horizon validation diagnostic applies to the gate result.',
    level: 'warning',
  },
};

function sarifLevel(level: 'error' | 'warn'): SarifLevel {
  return level === 'error' ? 'error' : 'warning';
}

function ruleFor(ruleId: string): SarifRule {
  const descriptor = ruleDescriptions[ruleId] ?? {
    title: ruleId,
    detail: 'Horizon policy gate finding.',
    level: sarifLevel('error'),
  };
  return {
    id: ruleId,
    name: ruleId.replace(/^horizon\//u, 'horizon_').replace(/[-/]/gu, '_'),
    shortDescription: { text: descriptor.title },
    fullDescription: { text: descriptor.detail },
    defaultConfiguration: { level: descriptor.level },
  };
}

function sarifResult(
  ruleId: string,
  level: 'error' | 'warn',
  message: string,
  file?: string,
  properties?: Record<string, unknown>,
): SarifResult {
  const fingerprint = sha256Id(stableStringify({ ruleId, file, message }));
  return {
    ruleId,
    level: sarifLevel(level),
    message: { text: message },
    ...(file ? { locations: [{ physicalLocation: { artifactLocation: { uri: file.replace(/\\/gu, '/') } } }] } : {}),
    partialFingerprints: { horizonFinding: fingerprint },
    ...(properties ? { properties } : {}),
  };
}

export function changeGateSarif(gate: GateLike, workspace = false): HorizonSarif {
  const rules = new Map<string, SarifRule>();
  const results: SarifResult[] = [];

  for (const violation of gate.violations) {
    const ruleId = violation.ruleId ?? 'horizon/diagnostic';
    rules.set(ruleId, ruleFor(ruleId));
    results.push(sarifResult(ruleId, violation.level, violation.message, violation.file, {
      decisionId: violation.decisionId,
    }));
  }

  for (const diagnostic of gate.diagnostics) {
    const ruleId = diagnostic.id ? `horizon/diagnostic/${diagnostic.id}` : 'horizon/diagnostic';
    rules.set(ruleId, ruleFor('horizon/diagnostic'));
    results.push(sarifResult(ruleId, diagnostic.level, diagnostic.message, undefined, {
      decisionId: diagnostic.id,
      rootName: (diagnostic as { rootName?: string }).rootName,
    }));
  }

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [{
      tool: {
        driver: {
          name: HORIZON_SARIF_DRIVER_NAME,
          version: HORIZON_VERSION,
          informationUri: 'https://github.com/TTAWDTT/horizon-ledger',
          rules: [...rules.values()].sort((left, right) => left.id.localeCompare(right.id)),
        },
      },
      results,
      properties: {
        verdict: gate.verdict,
        workspace,
        changedPaths: gate.files.length,
        governedPaths: gate.coverage.governed,
        unguardedPaths: gate.coverage.unguarded,
        gateDigest: gateDigestFor(gate),
      },
    }],
  };
}

export function workspaceChangeGateSarif(gate: WorkspaceChangeGate): HorizonSarif {
  return changeGateSarif(gate, true);
}
