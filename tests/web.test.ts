import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addEvidence, createDecision, initLedger } from '../src/core';
import { createLedgerServer } from '../src/web/server';

describe('web server', () => {
  it('serves a structured local dashboard API and viewer', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-web-'));
    const server = createLedgerServer(root);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const base = `http://127.0.0.1:${port}`;
    try {
      await initLedger(root);
      const decision = await createDecision(root, {
        title: 'Use SQLite for local storage',
        summary: 'SQLite is simple and portable.',
        context: 'Need a local-first store.',
        decision: 'Use SQLite.',
        consequences: 'Simple local setup.',
        tags: ['storage'],
        scope: ['src/core'],
        status: 'decided',
      });
      await addEvidence(root, decision.id, {
        type: 'link',
        value: 'https://sqlite.org',
        title: 'SQLite documentation',
        strength: 'strong',
      });

      const index = await fetch(base);
      expect(index.status).toBe(200);
      expect(index.headers.get('x-content-type-options')).toBe('nosniff');
      expect(await index.text()).toContain('Decision graph, evidence, and quality');

      const response = await fetch(`${base}/api/ledger`);
      const payload = await response.json();
      expect(payload.stats.total).toBe(1);
      expect(payload.stats.evidence).toBe(1);
      expect(payload.scores[decision.id].score).toBeGreaterThan(0);
      expect(payload.graph.nodes.some((node: any) => node.label === 'SQLite documentation')).toBe(true);
      expect(payload.diagnostics.some((item: any) => item.id === decision.id && item.level === 'error')).toBe(false);

      const searchResponse = await fetch(`${base}/api/ledger?q=sqlite`);
      const searchPayload = await searchResponse.json();
      expect(searchPayload.search[0].decision.id).toBe(decision.id);
      expect(searchPayload.search[0].quality.score).toBeGreaterThan(0);

      const health = await fetch(`${base}/api/health`);
      expect((await health.json())).toEqual({ ok: true });
    } finally {
      server.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
