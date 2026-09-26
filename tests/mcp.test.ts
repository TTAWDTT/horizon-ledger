import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readLedger } from '../src/core';
import { createMcpServer } from '../src/mcp';

function parseResult(result: any): any {
  const first = result.content?.[0];
  expect(first?.type).toBe('text');
  return JSON.parse(first.text);
}

async function connect(server: any) {
  const client = new Client({ name: 'horizon-test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('MCP server', () => {
  it('is read-only unless writing is explicitly enabled', async () => {
    const readonly = await connect(createMcpServer(process.cwd()));
    const tools = await readonly.listTools();
    const names = tools.tools.map((tool: any) => tool.name);
    expect(names).toContain('horizon_search');
    expect(names).toContain('horizon_conflicts');
    expect(names).not.toContain('horizon_create');
    await readonly.close();
  });

  it('captures and evolves decisions through write tools', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-mcp-'));
    const server = createMcpServer(root, { write: true });
    const client = await connect(server);
    try {
      const created = parseResult(await client.callTool({
        name: 'horizon_create',
        arguments: {
          title: 'Use SQLite for local storage',
          summary: 'SQLite is simple and portable.',
          context: 'Need a local-first store with strong consistency.',
          decision: 'Use SQLite.',
          consequences: 'Simple local setup.',
          status: 'decided',
          confidence: 'high',
          scope: ['src/core'],
          tags: ['storage'],
          alternatives: [
            { name: 'JSON files', verdict: 'rejected', reason: 'No concurrent consistency.' },
          ],
          evidence: [
            { type: 'link', value: 'https://sqlite.org', strength: 'strong', note: 'SQLite docs.' },
          ],
        },
      }));
      expect(created.id).toBe('D-0001');
      expect(created.alternatives[0].id).toBe('A-001');
      expect(created.evidence[0].id).toBe('E-001');

      const updated = parseResult(await client.callTool({
        name: 'horizon_update',
        arguments: { id: created.id, summary: 'SQLite is simple, portable, and tested.' },
      }));
      expect(updated.summary).toContain('tested');
      expect(updated.alternatives.length).toBe(1);
      expect(updated.evidence.length).toBe(1);

      const alternative = parseResult(await client.callTool({
        name: 'horizon_add_alternative',
        arguments: { id: created.id, name: 'Postgres', verdict: 'deferred', reason: 'Heavier than needed.' },
      }));
      expect(alternative.alternatives.length).toBe(2);

      const evidenced = parseResult(await client.callTool({
        name: 'horizon_add_evidence',
        arguments: { id: created.id, type: 'file', value: 'src/core', strength: 'moderate', note: 'Implementation matches the decision.' },
      }));
      expect(evidenced.evidence.length).toBe(2);

      const second = parseResult(await client.callTool({
        name: 'horizon_create',
        arguments: {
          title: 'Use YAML front matter',
          summary: 'Front matter is machine readable.',
          context: 'Need deterministic parsing.',
          decision: 'Use YAML front matter.',
          consequences: 'Simple integration.',
          alternatives: [{ name: 'JSON body', verdict: 'unknown' }],
        },
      }));
      const linked = parseResult(await client.callTool({
        name: 'horizon_link',
        arguments: { from: second.id, to: created.id, type: 'supersedes' },
      }));
      expect(linked.links[0]).toEqual({ id: created.id, type: 'supersedes', note: undefined });

      const ledger = await readLedger(root);
      expect(ledger.length).toBe(2);
    } finally {
      await client.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
