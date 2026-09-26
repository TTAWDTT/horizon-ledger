import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v4';
import path from 'node:path';
import {
  readLedger,
  searchLedger,
  buildGraph,
  scoreDecision,
  validateLedger,
  findConflicts,
  auditLedger,
  buildContextBundle,
  decisionsForFile,
  buildPullRequestGate,
  auditWorkspace,
  getWorkspaceDecision,
  buildWorkspaceContext,
  readWorkspace,
  readWorkspaceLedger,
  validateWorkspace,
  exportWorkspacePack,
  planWorkspacePackImport,
  workspaceSummary,
  createDecision,
  updateDecision,
  addLink,
  addAlternative,
  addEvidence,
  type Decision,
  type DecisionPolicy,
} from '../core';

function text(value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }];
}

function notFound(id: string) {
  return { content: [{ type: 'text' as const, text: `Decision not found: ${id}` }], isError: true };
}

function jsonResult(value: unknown) {
  return { content: text(value) };
}

const statusSchema = z.enum(['draft', 'proposed', 'decided', 'rejected', 'superseded']);
const confidenceSchema = z.enum(['low', 'medium', 'high']);
const horizonSchema = z.enum(['short', 'medium', 'long']);
const kindSchema = z.enum(['engineering', 'product', 'research', 'process', 'other']);
const evidenceTypeSchema = z.enum([
  'commit', 'file', 'link', 'doc', 'test', 'experiment', 'meeting', 'session', 'benchmark',
]);
const strengthSchema = z.enum(['strong', 'moderate', 'weak']);
const alternativeVerdictSchema = z.enum(['accepted', 'rejected', 'deferred', 'unknown']);


const relationSchema = z.enum(['supersedes', 'depends_on', 'related_to']);

const policyInputSchema = z.object({
  mode: z.enum(['observe', 'review', 'block']).default('review').describe('Whether the gate records, warns, or blocks'),
  requireEvidence: z.enum(['any', 'verified', 'strong']).default('verified').describe('Evidence quality required by the gate'),
}).optional();

function workspaceNotFound(root: string) {
  return {
    content: [{ type: 'text' as const, text: `No Horizon workspace found at ${root}` }],
    isError: true,
  };
}

const alternativeInputSchema = z.object({
  name: z.string().min(1).describe('Alternative considered'),
  verdict: alternativeVerdictSchema.default('unknown').describe('Whether this alternative was chosen or rejected'),
  reason: z.string().optional().describe('Why this alternative was accepted, rejected, or deferred'),
  evidenceIds: z.array(z.string()).optional().describe('Evidence ids supporting this verdict'),
});

const evidenceInputSchema = z.object({
  type: evidenceTypeSchema.describe('Evidence type'),
  value: z.string().min(1).describe('URL, path, commit, benchmark result, or evidence value'),
  title: z.string().optional().describe('Human-readable evidence title'),
  source: z.string().optional().describe('Source of the evidence'),
  strength: strengthSchema.default('moderate').describe('How strongly this supports the decision'),
  note: z.string().optional().describe('Why this evidence matters'),
  hash: z.string().regex(/^[a-f0-9]{64}$/i).optional().describe('Expected sha256 hash for local file evidence'),
});

export interface McpServerOptions {
  write?: boolean;
}

export function createMcpServer(rootArg?: string, options: McpServerOptions = {}): McpServer {
  const root = path.resolve(rootArg ?? process.env.HORIZON_ROOT ?? '.');
  const allowWrite = options.write ?? process.env.HORIZON_MCP_WRITE === '1';
  const server = new McpServer({ name: 'horizon-ledger', version: '0.14.0' });

  server.registerTool('horizon_list', {
    description: 'List all decisions in the current Horizon Ledger',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => jsonResult(await readLedger(root)));

  server.registerTool('horizon_search', {
    description: 'Search decisions by text',
    inputSchema: { query: z.string().describe('Search query') },
    annotations: { readOnlyHint: true },
  }, async ({ query }: { query: string }) => jsonResult(searchLedger(await readLedger(root), query)));

  server.registerTool('horizon_get', {
    description: 'Get a decision by id',
    inputSchema: { id: z.string().describe('Decision id') },
    annotations: { readOnlyHint: true },
  }, async ({ id }: { id: string }) => {
    const ledger = await readLedger(root);
    const decision = ledger.find((d) => d.id === id);
    if (!decision) return notFound(id);
    return jsonResult(decision);
  });

  server.registerTool('horizon_graph', {
    description: 'Get a graph of decisions, alternatives, and evidence',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => jsonResult(buildGraph(await readLedger(root))));

  server.registerTool('horizon_scope', {
    description: 'Find decisions that affect a file or directory',
    inputSchema: { path: z.string().describe('File or directory path') },
    annotations: { readOnlyHint: true },
  }, async ({ path: filePath }: { path: string }) => jsonResult(decisionsForFile(await readLedger(root), filePath)));

  server.registerTool('horizon_score', {
    description: 'Score how well each decision is evidenced',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const ledger = await readLedger(root);
    return jsonResult(ledger.map((d) => ({ id: d.id, title: d.title, score: scoreDecision(d) })));
  });

  server.registerTool('horizon_workspace_list', {
    description: 'List roots and decision counts in a Horizon workspace',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const workspace = await readWorkspace(root);
    if (!workspace) return workspaceNotFound(root);
    const entries = await readWorkspaceLedger(root, workspace);
    return jsonResult(workspaceSummary(entries, workspace));
  });

  server.registerTool('horizon_workspace_context', {
    description: 'Search decisions across all enabled workspace roots with provenance',
    inputSchema: { query: z.string().describe('Search query') },
    annotations: { readOnlyHint: true },
  }, async ({ query }: { query: string }) => {
    try {
      return jsonResult(await buildWorkspaceContext(root, query));
    } catch {
      return workspaceNotFound(root);
    }
  });

  server.registerTool('horizon_workspace_get', {
    description: 'Get a workspace decision with root provenance by id',
    inputSchema: { id: z.string().describe('Decision id') },
    annotations: { readOnlyHint: true },
  }, async ({ id }: { id: string }) => {
    try {
      const found = await getWorkspaceDecision(root, id);
      if (!found) return notFound(id);
      return jsonResult(found);
    } catch {
      return workspaceNotFound(root);
    }
  });
  server.registerTool('horizon_workspace_validate', {
    description: 'Validate all enabled workspace roots as one decision graph',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    try {
      return jsonResult(await validateWorkspace(root));
    } catch {
      return workspaceNotFound(root);
    }
  });

  server.registerTool('horizon_workspace_audit', {
    description: 'Audit evidence targets across all enabled workspace roots',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    try {
      return jsonResult(await auditWorkspace(root));
    } catch {
      return workspaceNotFound(root);
    }
  });
  server.registerTool('horizon_workspace_pack_export', {
    description: 'Export a deterministic, hash-bound workspace decision pack',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    try {
      return jsonResult(await exportWorkspacePack(root));
    } catch {
      return workspaceNotFound(root);
    }
  });
  server.registerTool('horizon_workspace_pack_import_plan', {
    description: 'Plan a workspace pack import without writing any files',
    inputSchema: { pack: z.string().describe('Raw Horizon workspace pack JSON') },
    annotations: { readOnlyHint: true },
  }, async ({ pack }: { pack: string }) => {
    try {
      return jsonResult(await planWorkspacePackImport(root, pack));
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  });
  server.registerTool('horizon_gate', {
    description: 'Check changed files against policy-governed decisions',
    inputSchema: {
      base: z.string().optional().describe('Base ref or sha; defaults to HEAD~1'),
      head: z.string().optional().describe('Head ref or sha; defaults to HEAD'),
      files: z.array(z.string()).optional().describe('Changed paths to check'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ base, head, files }: { base?: string; head?: string; files?: string[] }) => {
    try {
      return jsonResult(await buildPullRequestGate(root, base ?? 'HEAD~1', head ?? 'HEAD', files));
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  });
  server.registerTool('horizon_validate', {
    description: 'Validate the ledger and return diagnostics',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => jsonResult(validateLedger(await readLedger(root))));

  server.registerTool('horizon_conflicts', {
    description: 'Detect contradictory or incomplete decision relationships',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => jsonResult(findConflicts(await readLedger(root))));
  server.registerTool('horizon_audit', {
    description: 'Verify that decision evidence targets actually exist',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => jsonResult(await auditLedger(await readLedger(root), root)));

  server.registerTool('horizon_context', {
    description: 'Build a deterministic decision context bundle for a file path or text query',
    inputSchema: {
      query: z.string().describe('File path or text query'),
      limit: z.number().int().positive().max(50).default(10).optional(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ query, limit }: { query: string; limit?: number }) => jsonResult(await buildContextBundle(root, query, limit)));

  if (allowWrite) {
  server.registerTool('horizon_create', {
    description: 'Capture a durable decision with context, alternatives, consequences, and optional evidence',
    inputSchema: {
      title: z.string().min(3).describe('Short, specific decision title'),
      summary: z.string().min(1).describe('One-paragraph summary'),
      context: z.string().min(1).describe('Why the decision was needed'),
      decision: z.string().min(1).describe('What was decided'),
      consequences: z.string().min(1).describe('Consequences, tradeoffs, and follow-up effects'),
      status: statusSchema.default('proposed').describe('Decision status'),
      confidence: confidenceSchema.default('medium').describe('Confidence in the decision'),
      horizon: horizonSchema.default('medium').describe('Expected decision horizon'),
      kind: kindSchema.default('engineering').describe('Decision category'),
      owner: z.string().optional().describe('Decision owner'),
      tags: z.array(z.string()).default([]).describe('Tags'),
      scope: z.array(z.string()).default([]).describe('Files or directories affected'),
      policy: policyInputSchema.describe('Optional gate policy for this decision'),
      alternatives: z.array(alternativeInputSchema).min(1).describe('At least one alternative considered'),
      evidence: z.array(evidenceInputSchema).default([]).describe('Evidence supporting the decision'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async (args: {
    title: string; summary: string; context: string; decision: string; consequences: string;
    status?: 'draft' | 'proposed' | 'decided' | 'rejected' | 'superseded';
    confidence?: 'low' | 'medium' | 'high';
    horizon?: 'short' | 'medium' | 'long';
    kind?: 'engineering' | 'product' | 'research' | 'process' | 'other';
    owner?: string; tags?: string[]; scope?: string[]; policy?: DecisionPolicy;
    alternatives: Array<{ name: string; verdict?: 'accepted' | 'rejected' | 'deferred' | 'unknown'; reason?: string; evidenceIds?: string[] }>;
    evidence?: Array<{ type: any; value: string; title?: string; source?: string; strength?: any; note?: string }>;
  }) => {
    const { alternatives = [], evidence = [], ...input } = args;
    const created = await createDecision(root, input);
    for (const alternative of alternatives) await addAlternative(root, created.id, alternative);
    for (const item of evidence) await addEvidence(root, created.id, item);
    const ledger = await readLedger(root);
    return jsonResult(ledger.find((d) => d.id === created.id));
  });

  server.registerTool('horizon_update', {
    description: 'Update selected fields on a decision without erasing omitted fields',
    inputSchema: {
      id: z.string().describe('Decision id'),
      title: z.string().min(3).optional(),
      summary: z.string().optional(),
      context: z.string().optional(),
      decision: z.string().optional(),
      consequences: z.string().optional(),
      status: statusSchema.optional(),
      confidence: confidenceSchema.optional(),
      horizon: horizonSchema.optional(),
      kind: kindSchema.optional(),
      owner: z.string().optional(),
      tags: z.array(z.string()).optional(),
      scope: z.array(z.string()).optional(),
      policy: policyInputSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async (args: { id: string } & Record<string, unknown>) => {
    const { id, ...patch } = args;
    const updated = await updateDecision(root, id, patch);
    if (!updated) return notFound(id);
    const ledger = await readLedger(root);
    return jsonResult(ledger.find((d) => d.id === id));
  });

  server.registerTool('horizon_link', {
    description: 'Create a relationship between two decisions',
    inputSchema: {
      from: z.string().describe('Source decision id'),
      to: z.string().describe('Target decision id'),
      type: relationSchema.default('related_to').describe('Relationship type'),
      note: z.string().optional().describe('Relationship note'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ from, to, type, note }: { from: string; to: string; type?: 'supersedes' | 'depends_on' | 'related_to'; note?: string }) => {
    const ledger = await readLedger(root);
    if (!ledger.some((d) => d.id === to)) return notFound(to);
    const updated = await addLink(root, from, { id: to, type: type ?? 'related_to', note });
    if (!updated) return notFound(from);
    return jsonResult(updated);
  });

  server.registerTool('horizon_add_alternative', {
    description: 'Add a considered alternative to a decision',
    inputSchema: {
      id: z.string().describe('Decision id'),
      name: z.string().min(1).describe('Alternative considered'),
      verdict: alternativeVerdictSchema.default('unknown').describe('Whether this alternative was chosen or rejected'),
      reason: z.string().optional().describe('Why this alternative was accepted, rejected, or deferred'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ id, name, verdict, reason }: { id: string; name: string; verdict?: 'accepted' | 'rejected' | 'deferred' | 'unknown'; reason?: string }) => {
    const updated = await addAlternative(root, id, { name, verdict, reason });
    if (!updated) return notFound(id);
    return jsonResult(updated);
  });

  server.registerTool('horizon_add_evidence', {
    description: 'Add supporting evidence to a decision',
    inputSchema: {
      id: z.string().describe('Decision id'),
      type: evidenceTypeSchema.describe('Evidence type'),
      value: z.string().min(1).describe('URL, path, commit, benchmark result, or evidence value'),
      title: z.string().optional().describe('Human-readable evidence title'),
      source: z.string().optional().describe('Evidence source'),
      strength: strengthSchema.default('moderate').describe('How strongly this supports the decision'),
      note: z.string().optional().describe('Why this evidence matters'),
      hash: z.string().regex(/^[a-f0-9]{64}$/i).optional().describe('Expected sha256 hash for local file evidence'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ id, ...evidence }: { id: string } & Record<string, unknown>) => {
    const updated = await addEvidence(root, id, evidence as any);
    if (!updated) return notFound(id);
    return jsonResult(updated);
  });
  }

  return server;
}

export async function startMcpServer(rootArg?: string, options: McpServerOptions = {}): Promise<void> {
  const server = createMcpServer(rootArg, options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const root = path.resolve(rootArg ?? process.env.HORIZON_ROOT ?? '.');
  console.error(`Horizon Ledger MCP server running on stdio. Root: ${root}. Write tools: ${options.write || process.env.HORIZON_MCP_WRITE === '1' ? 'enabled' : 'disabled'}`);
}
