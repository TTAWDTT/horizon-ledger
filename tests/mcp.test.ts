import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDecision, createGateReport, initLedger, initWorkspace, readLedger, verifyGateReport } from '../src/core';
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
    expect(names).toContain('horizon_audit');
    expect(names).toContain('horizon_context');
    expect(names).not.toContain('horizon_create');
    await readonly.close();
  });

  it('verifies hash-bound gate reports', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-mcp-report-'));
    const server = createMcpServer(root);
    const client = await connect(server);
    try {
      await initLedger(root);
      const gate = {
        version: 1,
        root,
        files: ['src/core/storage.ts'],
        decisions: [],
        coverage: { governed: 1, unguarded: 0 },
        conflicts: [],
        audit: { verified: 0, missing: 0, external: 0, unverifiable: 0, sealed: 0, findings: [] },
        diagnostics: [],
        violations: [],
        verdict: 'pass',
      };
      const report = createGateReport({ root, base: 'main', head: 'HEAD', gate });
      const raw = JSON.stringify(report);
      const verified = parseResult(await client.callTool({
        name: 'horizon_verify_gate_report',
        arguments: { report: raw },
      }));
      expect(verified.ok).toBe(true);
      expect(verified.reportId).toBe(report.reportId);
      expect(verified.verdict).toBe('pass');
      expect(verifyGateReport(raw).ok).toBe(true);

      const mismatch = await client.callTool({
        name: 'horizon_verify_gate_report',
        arguments: { report: raw, expectVerdict: 'block' },
      });
      expect(mismatch.isError).toBe(true);
    } finally {
      await client.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it('exposes workspace tools as read-only context', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-mcp-workspace-'));
    const server = createMcpServer(root);
    const client = await connect(server);
    try {
      const empty = await client.callTool({ name: 'horizon_workspace_validate', arguments: {} });
      expect(empty.isError).toBe(true);

      await initLedger(root);
      await initWorkspace(root);
      await fs.mkdir(path.join(root, 'src', 'core'), { recursive: true });
      await fs.writeFile(path.join(root, 'src', 'core', 'index.ts'), 'export {};');
      const created = await createDecision(root, {
        title: 'Use SQLite for workspace storage',
        summary: 'SQLite keeps local data portable.',
        context: 'The workspace needs local-first storage.',
        decision: 'Use SQLite.',
        consequences: 'No hosted dependency.',
        scope: ['core'],
        alternatives: [{ id: 'A-001', name: 'Postgres', verdict: 'rejected', reason: 'Too heavy locally.' }],
        evidence: [{ id: 'E-001', type: 'file', value: 'src/core/index.ts', strength: 'strong' }],
      });

      const summary = parseResult(await client.callTool({ name: 'horizon_workspace_list', arguments: {} }));
      expect(summary.decisions).toBe(1);
      expect(summary.roots[0].decisions).toBe(1);

      const context = parseResult(await client.callTool({
        name: 'horizon_workspace_context',
        arguments: { query: 'SQLite' },
      }));
      const found = parseResult(await client.callTool({
        name: 'horizon_workspace_get',
        arguments: { id: created.id },
      }));
      expect(found.rootId).toBe('r-001');
      expect(context.decisions[0].decision.id).toBe(created.id);

      const audit = parseResult(await client.callTool({ name: 'horizon_workspace_audit', arguments: {} }));
      expect(audit.verified).toBe(1);

      const pack = parseResult(await client.callTool({ name: 'horizon_workspace_pack_export', arguments: {} }));
      expect(pack.packId).toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(pack.decisions).toHaveLength(1);

      const packPlan = parseResult(await client.callTool({
        name: 'horizon_workspace_pack_import_plan',
        arguments: { pack: JSON.stringify(pack) },
      }));
      expect(packPlan.ok).toBe(true);
      expect(packPlan.reuseDecisions).toBe(1);

      const resources = await client.listResources();
      expect(resources.resources.map((resource: any) => resource.uri)).toContain('horizon://decisions');

      const decisionResource = await client.readResource({
        uri: 'horizon://decisions/D-0001',
      });
      const decisionContents = decisionResource.contents[0] as any;
      expect(decisionResource.contents[0].uri).toBe('horizon://decisions/D-0001');
      expect(JSON.parse(decisionResource.contents[0].text).id).toBe('D-0001');

      const packResource = await client.readResource({ uri: 'horizon://workspace/pack' });
      const packContents = JSON.parse(packResource.contents[0].text);
      expect(packContents.packId).toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(packContents.decisions).toHaveLength(1);

      const evidence = parseResult(await client.callTool({
        name: 'horizon_workspace_evidence_export',
        arguments: { files: ['src/core/index.ts'] },
      }));
      expect(evidence.evidencePackId).toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(evidence.artifacts.map((artifact: any) => artifact.name)).toEqual(['decision-pack.json', 'gate-report.json']);

      const evidenceVerified = parseResult(await client.callTool({
        name: 'horizon_workspace_evidence_verify',
        arguments: { evidencePack: JSON.stringify(evidence), expectGateVerdict: 'pass' },
      }));
      expect(evidenceVerified.ok).toBe(true);
      expect(evidenceVerified.packId).toBe(evidence.statement.predicate.packId);

      const evidenceMismatch = await client.callTool({
        name: 'horizon_workspace_evidence_verify',
        arguments: { evidencePack: JSON.stringify(evidence), expectGateVerdict: 'block' },
      });
      expect(evidenceMismatch.isError).toBe(true);
      const validation = parseResult(await client.callTool({ name: 'horizon_workspace_validate', arguments: {} }));
      expect(validation.decisions).toBe(1);
      expect(validation.ok).toBe(true);
    } finally {
      await client.close();
      await fs.rm(root, { recursive: true, force: true });
    }
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
          policy: { mode: 'review', requireEvidence: 'any' },
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
      expect(created.policy).toEqual({ mode: 'review', requireEvidence: 'any' });

      const updated = parseResult(await client.callTool({
        name: 'horizon_update',
        arguments: { id: created.id, summary: 'SQLite is simple, portable, and tested.', policy: { mode: 'block', requireEvidence: 'strong' } },
      }));
      expect(updated.summary).toContain('tested');
      expect(updated.alternatives.length).toBe(1);
      expect(updated.evidence.length).toBe(1);
      expect(updated.policy).toEqual({ mode: 'block', requireEvidence: 'strong' });

      const alternative = parseResult(await client.callTool({
        name: 'horizon_add_alternative',
        arguments: { id: created.id, name: 'Postgres', verdict: 'deferred', reason: 'Heavier than needed.' },
      }));
      expect(alternative.alternatives.length).toBe(2);

      await fs.mkdir(path.join(root, 'src', 'core'), { recursive: true });
      await fs.writeFile(path.join(root, 'src', 'core', 'proof.md'), 'SQLite is local and portable.');
      const evidenced = parseResult(await client.callTool({
        name: 'horizon_add_evidence',
        arguments: { id: created.id, type: 'file', value: 'src/core/proof.md', strength: 'moderate', note: 'Implementation matches the decision.' },
      }));
      expect(evidenced.evidence.length).toBe(2);

      const sealed = parseResult(await client.callTool({
        name: 'horizon_seal_evidence',
        arguments: { decisionId: created.id, evidenceId: 'E-002' },
      }));
      expect(sealed.changed).toBe(true);
      expect(sealed.hash).toMatch(/^[a-f0-9]{64}$/u);

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
