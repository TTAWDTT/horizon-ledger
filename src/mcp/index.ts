import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v4';
import path from 'node:path';
import { readLedger, searchLedger, buildGraph, scoreDecision, validateLedger, decisionsForFile } from '../core';

function text(value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }];
}

export async function startMcpServer(rootArg?: string): Promise<void> {
  const root = path.resolve(rootArg ?? process.env.HORIZON_ROOT ?? '.');
  const server = new McpServer({ name: 'horizon-ledger', version: '0.1.0' });

  server.registerTool('horizon_list', {
    description: 'List all decisions in the current Horizon Ledger',
    inputSchema: {},
  }, async () => {
    const ledger = await readLedger(root);
    return { content: text(ledger) };
  });

  server.registerTool('horizon_search', {
    description: 'Search decisions by text',
    inputSchema: { query: z.string().describe('Search query') },
  }, async ({ query }: { query: string }) => {
    const ledger = await readLedger(root);
    const hits = searchLedger(ledger, query);
    return { content: text(hits) };
  });

  server.registerTool('horizon_get', {
    description: 'Get a decision by id',
    inputSchema: { id: z.string().describe('Decision id') },
  }, async ({ id }: { id: string }) => {
    const ledger = await readLedger(root);
    const decision = ledger.find((d) => d.id === id);
    if (!decision) return { content: [{ type: 'text', text: `Decision not found: ${id}` }] };
    return { content: text(decision) };
  });

  server.registerTool('horizon_graph', {
    description: 'Get a graph of decisions, alternatives, and evidence',
    inputSchema: {},
  }, async () => {
    const ledger = await readLedger(root);
    const graph = buildGraph(ledger);
    return { content: text(graph) };
  });

  
  server.registerTool('horizon_scope', {
    description: 'Find decisions that affect a file or directory',
    inputSchema: { path: z.string().describe('File or directory path') },
  }, async ({ path: filePath }: { path: string }) => {
    const ledger = await readLedger(root);
    const relevant = decisionsForFile(ledger, filePath);
    return { content: text(relevant) };
  });

server.registerTool('horizon_score', {
    description: 'Score how well each decision is evidenced',
    inputSchema: {},
  }, async () => {
    const ledger = await readLedger(root);
    const scores = ledger.map((d) => ({ id: d.id, title: d.title, score: scoreDecision(d) }));
    return { content: text(scores) };
  });

  server.registerTool('horizon_validate', {
    description: 'Validate the ledger and return diagnostics',
    inputSchema: {},
  }, async () => {
    const ledger = await readLedger(root);
    return { content: text(validateLedger(ledger)) };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Horizon Ledger MCP server running on stdio. Root: ${root}`);
}
