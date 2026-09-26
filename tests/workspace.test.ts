import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  disableWorkspaceRoot,
  enableWorkspaceRoot,
  removeWorkspaceRoot,
  workspaceConfigPath,
  WorkspaceConfigError,
  addWorkspaceRoot,
  auditWorkspace,
  buildWorkspaceContext,
  buildWorkspacePullRequestContext,
  createDecision,
  exportWorkspace,
  getWorkspaceDecision,
  initLedger,
  initWorkspace,
  readWorkspace,
  readWorkspaceLedger,
  validateWorkspace,
  workspaceContextMarkdown,
  workspaceExportMarkdown,
  workspacePullRequestContextMarkdown,
  workspaceSummary,
} from '../src/core';

async function makeRoot(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'horizon-workspace-'));
}

describe('horizon workspace', () => {
  it('aggregates, searches, and validates decisions across roots', async () => {
    const first = await makeRoot();
    const second = await makeRoot();
    const workspaceRoot = await makeRoot();
    await initLedger(workspaceRoot);

    await createDecision(first, {
      title: 'Use SQLite for workspace storage',
      summary: 'SQLite keeps local data portable.',
      context: 'The workspace needs local-first storage.',
      decision: 'Use SQLite.',
      consequences: 'No hosted dependency.',
      scope: ['core/storage'],
      alternatives: [{ id: 'A-001', name: 'Postgres', verdict: 'rejected', reason: 'Too heavy locally.' }],
      evidence: [{ id: 'E-001', type: 'file', value: 'evidence.md', strength: 'strong' }],
    });
    await createDecision(second, {
      id: 'D-0002',
      title: 'Keep evidence close to code',
      summary: 'Evidence should be verifiable from the repository.',
      context: 'Agents need deterministic context.',
      decision: 'Store file evidence in each root.',
      consequences: 'Auditors can verify provenance.',
      scope: ['tools/evidence'],
      alternatives: [{ id: 'A-001', name: 'Remote database', verdict: 'rejected', reason: 'Weak provenance.' }],
      evidence: [{ id: 'E-001', type: 'file', value: 'evidence.md', strength: 'moderate' }],
    });

    await initWorkspace(workspaceRoot);
    await addWorkspaceRoot(workspaceRoot, first, 'first');
    await addWorkspaceRoot(workspaceRoot, second, 'second');
    const config = await readWorkspace(workspaceRoot);
    const entries = await readWorkspaceLedger(workspaceRoot, config);
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((entry) => entry.rootName))).toEqual(new Set(['second', 'first']));

    const summary = workspaceSummary(entries, config);
    expect(summary.decisions).toBe(2);
    expect(summary.roots.find((root) => root.name === 'first')?.decisions).toBe(1);

    const context = await buildWorkspaceContext(workspaceRoot, 'SQLite evidence');
    const found = await getWorkspaceDecision(workspaceRoot, 'D-0001');
    expect(found?.rootName).toBe('first');
    expect(context.decisions.map((hit) => hit.decision.id)).toContain('D-0001');
    expect(context.decisions.every((hit) => hit.rootName.length > 0)).toBe(true);
    expect(workspaceContextMarkdown(context)).toContain('[first] D-0001');

    await fs.writeFile(path.join(first, 'evidence.md'), '# first evidence');
    await fs.writeFile(path.join(second, 'evidence.md'), '# second evidence');
    const audit = await auditWorkspace(workspaceRoot);
    expect(audit.decisions).toBe(2);
    expect(audit.verified).toBe(2);
    expect(audit.ok).toBe(true);

    const exported = await exportWorkspace(workspaceRoot);
    expect(exported.decisions).toHaveLength(2);
    expect(exported.audit.verified).toBe(2);
    expect(workspaceExportMarkdown(exported)).toContain('## [first] D-0001');

    const validation = await validateWorkspace(workspaceRoot);
    expect(validation.decisions).toBe(2);
    expect(validation.diagnostics.some((diagnostic) => diagnostic.level === 'error')).toBe(false);
  });

  it('maps pull request files to workspace root decisions', async () => {
    const workspaceRoot = await makeRoot();
    const apiRoot = path.join(workspaceRoot, 'packages', 'api');
    const webRoot = path.join(workspaceRoot, 'packages', 'web');
    await initLedger(apiRoot);
    await initLedger(webRoot);

    await createDecision(apiRoot, {
      title: 'Use SQLite in API',
      summary: 'API storage uses SQLite.',
      context: 'The API needs local-first storage.',
      decision: 'Use SQLite.',
      consequences: 'The API remains portable.',
      scope: ['src'],
      alternatives: [{ id: 'A-001', name: 'Postgres', verdict: 'rejected', reason: 'Too heavy.' }],
      evidence: [{ id: 'E-001', type: 'file', value: 'src', strength: 'strong' }],
    });
    await createDecision(webRoot, {
      id: 'D-0002',
      title: 'Use server components',
      summary: 'Server components reduce client JavaScript.',
      context: 'The web app needs fast initial rendering.',
      decision: 'Use server components.',
      consequences: 'Some interactions need client components.',
      scope: ['app'],
      alternatives: [{ id: 'A-001', name: 'SPA', verdict: 'rejected', reason: 'Larger bundle.' }],
      evidence: [{ id: 'E-001', type: 'file', value: 'app', strength: 'strong' }],
    });

    await initWorkspace(workspaceRoot);
    await addWorkspaceRoot(workspaceRoot, apiRoot, 'api');
    await addWorkspaceRoot(workspaceRoot, webRoot, 'web');

    const context = await buildWorkspacePullRequestContext(workspaceRoot, 'main', 'HEAD', [
      'packages/api/src/storage.ts',
      'packages/web/app/page.tsx',
      'README.md',
    ]);
    expect(context.decisions.map((item) => item.rootName).sort()).toEqual(['api', 'web']);
    expect(context.decisions.map((item) => item.decision.id).sort()).toEqual(['D-0001', 'D-0002']);
    expect(workspacePullRequestContextMarkdown(context)).toContain('[api] D-0001');
    expect(workspacePullRequestContextMarkdown(context)).toContain('[web] D-0002');
  });
  it('detects duplicate IDs and contradictory verdicts across roots', async () => {
    const first = await makeRoot();
    const second = await makeRoot();
    const workspaceRoot = await makeRoot();
    await initLedger(workspaceRoot);
    await initWorkspace(workspaceRoot);

    await createDecision(first, {
      id: 'D-0001',
      title: 'Adopt SQLite',
      summary: 'SQLite is local.',
      context: 'Local storage is required.',
      decision: 'Use SQLite.',
      consequences: 'Data stays local.',
      scope: ['core'],
      alternatives: [{ id: 'A-001', name: 'SQLite', verdict: 'accepted' }],
    });
    await createDecision(second, {
      id: 'D-0001',
      title: 'Reject SQLite',
      summary: 'SQLite does not fit.',
      context: 'A hosted store is required.',
      decision: 'Use hosted storage.',
      consequences: 'Data is remote.',
      scope: ['core'],
      alternatives: [{ id: 'A-001', name: 'SQLite', verdict: 'rejected' }],
    });
    await addWorkspaceRoot(workspaceRoot, first, 'first');
    await addWorkspaceRoot(workspaceRoot, second, 'second');

    const validation = await validateWorkspace(workspaceRoot);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.some((item) => item.message.includes('duplicated across'))).toBe(true);
    const context = await buildWorkspaceContext(workspaceRoot, 'SQLite');
    expect(context.conflicts.some((conflict) => conflict.kind === 'contradictory_verdict')).toBe(true);
  });

  it('reports a missing enabled workspace root', async () => {
    const root = await makeRoot();
    const missing = await makeRoot();
    await initLedger(missing);
    await initLedger(root);
    await initWorkspace(root);
    await addWorkspaceRoot(root, missing, 'missing');
    const config = await readWorkspace(root);
    await fs.rm(missing, { recursive: true, force: true });

    const validation = await validateWorkspace(root, config);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.some((diagnostic) => diagnostic.message.includes('cannot be read'))).toBe(true);
  });
  it('rejects invalid workspace configs instead of silently treating them as missing', async () => {
    const root = await makeRoot();
    await fs.mkdir(path.join(root, '.horizon'), { recursive: true });
    await fs.writeFile(workspaceConfigPath(root), JSON.stringify({
      version: 1,
      name: 'Broken',
      roots: [
        { id: 'r-001', name: 'same', path: '.', enabled: 'yes' },
        { id: 'r-001', name: 'same', path: '../outside', enabled: true },
      ],
    }), 'utf8');

    try {
      await readWorkspace(root);
      throw new Error('Expected WorkspaceConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceConfigError);
      if (error instanceof WorkspaceConfigError) {
        expect(error.issues.some((issue) => issue.message.includes('Duplicate root id'))).toBe(true);
        expect(error.issues.some((issue) => issue.message.includes('Duplicate root name'))).toBe(true);
        expect(error.issues.some((issue) => issue.path.endsWith('.enabled'))).toBe(true);
      }
    }
  });

  it('removes, enables, and disables workspace roots', async () => {
    const first = await makeRoot();
    const second = await makeRoot();
    const root = await makeRoot();
    await initLedger(first);
    await initLedger(second);
    await initLedger(root);
    await initWorkspace(root);
    await addWorkspaceRoot(root, first, 'first');
    await addWorkspaceRoot(root, second, 'second');

    const disabled = await disableWorkspaceRoot(root, 'first');
    expect(disabled.roots.find((item) => item.name === 'first')?.enabled).toBe(false);

    const enabled = await enableWorkspaceRoot(root, 'first');
    expect(enabled.roots.find((item) => item.name === 'first')?.enabled).toBe(true);

    const removed = await removeWorkspaceRoot(root, 'first');
    expect(removed.name).toBe('first');
    const config = await readWorkspace(root);
    expect(config?.roots.map((item) => item.name)).not.toContain('first');
    expect(config?.roots).toHaveLength(2);
  });
});
