#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import {
  readLedger,
  createDecision,
  updateDecision,
  addEvidence,
  addLink,
  validateLedger,
  findConflicts,
  importAdrDirectory,
  auditLedger,
  buildContextBundle,
  contextBundleMarkdown,
  buildPullRequestContext,
  pullRequestContextMarkdown,
  searchLedger,
  buildGraph,
  scoreDecision,
  decisionsForFile,
  exportLedger,
  exportMarkdown,
  disableWorkspaceRoot,
  enableWorkspaceRoot,
  removeWorkspaceRoot,
  addWorkspaceRoot,
  auditWorkspace,
  buildWorkspaceContext,
  buildWorkspacePullRequestContext,
  getWorkspaceDecision,
  exportWorkspace,
  initWorkspace,
  readWorkspace,
  readWorkspaceLedger,
  validateWorkspace,
  workspaceContextMarkdown,
  workspaceExportMarkdown,
  workspacePullRequestContextMarkdown,
  workspaceSummary,
} from '../core';
import { initLedger } from '../core/ledger';
import { startMcpServer } from '../mcp';
import { startLedgerServer } from '../web/server';

const program = new Command();

program
  .name('horizon')
  .description('Local-first decision ledger for humans and AI agents.')
  .version('0.10.0');

program
  .command('init')
  .description('Initialize a new Horizon Ledger in the current directory.')
  .option('-r, --root <path>', 'project root', '.')
  .option('--mcp', 'also write a .mcp.json config for MCP clients')
  .action(async (options: { root?: string; mcp?: boolean }) => {
    const root = path.resolve(options.root ?? '.');
    await initLedger(root);
    if (options.mcp) {
      const config = {
        mcpServers: {
          'horizon-ledger': {
            command: 'npx',
            args: ['horizon-ledger', 'mcp', '--root', root],
          },
        },
      };
      const fs2 = await import('node:fs/promises');
      const mcpPath = path.join(root, '.mcp.json');
      const exists = await fs2.access(mcpPath).then(() => true).catch(() => false);
      if (!exists) {
        await fs2.writeFile(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
        console.log('Wrote .mcp.json');
      }
      console.log('Wrote .mcp.json');
    }
    console.log('Initialized Horizon Ledger at ' + root);
  });

program
  .command('add')
  .description('Create a new decision')
  .option('-t, --title <title>', 'decision title')
  .option('-s, --status <status>', 'draft | proposed | decided | rejected | superseded', 'draft')
  .option('-c, --confidence <confidence>', 'low | medium | high', 'medium')
  .option('-k, --kind <kind>', 'engineering | product | research | process | other', 'engineering')
  .option('-o, --owner <owner>', 'owner of the decision')
  .option('-a, --summary <summary>', 'short summary')
  .option('-x, --context <context>', 'context')
  .option('-d, --decision <decision>', 'decision')
  .option('-f, --consequences <consequences>', 'consequences')
  .option('--tag <tag>', 'tag (repeatable)', (v: string, prev: string[]) => [...(prev ?? []), v], [])
  .option('--scope <scope>', 'scope (repeatable)', (v: string, prev: string[]) => [...(prev ?? []), v], [])
  .option('-r, --root <path>', 'project root', '.')
  .action(async (options) => {
    const root = path.resolve(options.root ?? '.');
    if (!options.title) {
      console.error('A title is required.');
      process.exitCode = 1;
      return;
    }
    const created = await createDecision(root, {
      title: options.title,
      status: options.status,
      confidence: options.confidence,
      kind: options.kind,
      owner: options.owner,
      summary: options.summary,
      context: options.context,
      decision: options.decision,
      consequences: options.consequences,
      tags: options.tag,
      scope: options.scope,
    });
    console.log(`Created decision ${created.id}: ${created.title}`);
  });


program
  .command('link <from> <to>')
  .description('Create a relationship between two decisions')
  .option('-t, --type <type>', 'supersedes | depends_on | related_to', 'related_to')
  .option('-n, --note <note>', 'relationship note')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (from: string, to: string, options) => {
    const root = path.resolve(options.root ?? '.');
    const updated = await addLink(root, from, { id: to, type: options.type, note: options.note });
    if (!updated) {
      console.error('Decision not found: ' + from);
      process.exitCode = 1;
      return;
    }
    console.log('Linked ' + from + ' ' + options.type + ' ' + to);
  });

program
  .command('update <id>')
  .description('Update fields on an existing decision')
  .option('-t, --title <title>', 'new title')
  .option('-s, --status <status>', 'new status')
  .option('-a, --summary <summary>', 'new summary')
  .option('-x, --context <context>', 'new context')
  .option('-d, --decision <decision>', 'new decision')
  .option('-f, --consequences <consequences>', 'new consequences')
  .option('--tag <tag>', 'tag (repeatable)', (v: string, prev: string[]) => [...(prev ?? []), v], [])
  .option('--scope <scope>', 'scope (repeatable)', (v: string, prev: string[]) => [...(prev ?? []), v], [])
  .option('-r, --root <path>', 'project root', '.')
  .action(async (id: string, options) => {
    const root = path.resolve(options.root ?? '.');
    const updated = await updateDecision(root, id, {
      title: options.title,
      status: options.status,
      summary: options.summary,
      context: options.context,
      decision: options.decision,
      consequences: options.consequences,
      tags: options.tag,
      scope: options.scope,
    });
    if (!updated) {
      console.error(`Decision not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Updated decision ${updated.id}`);
  });

program
  .command('doctor')
  .description('Show a quick health summary of the ledger')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (options) => {
    const root = path.resolve(options.root ?? '.');
    const ledger = await readLedger(root);
    const diagnostics = validateLedger(ledger);
    console.log('root=' + root);
    console.log('decisions=' + ledger.length);
    console.log('diagnostics=' + diagnostics.length);
    for (const d of ledger) {
      console.log(d.id + '\t' + scoreDecision(d).score + '/' + scoreDecision(d).total + '\t' + d.title);
    }
  });

program
  .command('list')
  .description('List decisions')
  .option('-r, --root <path>', 'project root', '.')
  .option('--status <status>', 'filter by status')
  .action(async (options) => {
    const root = path.resolve(options.root ?? '.');
    const ledger = await readLedger(root);
    const filtered = options.status ? ledger.filter((d) => d.status === options.status) : ledger;
    if (!filtered.length) {
      console.log('No decisions found.');
      return;
    }
    for (const d of filtered) {
      const score = scoreDecision(d);
      console.log(`${d.id}\t${d.status}\t${score.score}/${score.total}\t${d.title}`);
    }
  });




program
  .command('scope <path>')
  .description('Show decisions that affect a file or directory')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (filePath: string, options) => {
    const root = path.resolve(options.root ?? '.');
    const ledger = await readLedger(root);
    const relevant = decisionsForFile(ledger, filePath);
    if (!relevant.length) {
      console.log('No decisions found for ' + filePath);
      return;
    }
    for (const d of relevant) {
      console.log(d.id + '	' + d.title);
      console.log('  ' + (d.decision || d.summary || 'No decision text'));
    }
  });

program
  .command('why <query>')
  .description('Answer "why" questions by searching the decision ledger')
  .option('-r, --root <path>', 'project root', '.')
  .option('-n, --limit <limit>', 'max results', '3')
  .action(async (query: string, options) => {
    const root = path.resolve(options.root ?? '.');
    const ledger = await readLedger(root);
    const looksLikePath = /[\\/]/.test(query);
    const relevant = looksLikePath ? decisionsForFile(ledger, query) : [];
    const hits = looksLikePath
      ? relevant.map((decision) => ({ decision, score: 1, reason: 'scope match' }))
      : searchLedger(ledger, query).slice(0, Number(options.limit) || 3);
    for (const hit of hits) {
      const d = hit.decision;
      console.log(d.id + ' ' + d.title);
      console.log('  ' + (d.decision || d.summary || 'No decision text'));
      for (const e of d.evidence ?? []) {
        console.log('  evidence: ' + e.type + ' ' + (e.title || e.value));
      }
      console.log('  score=' + scoreDecision(d).score + '/' + scoreDecision(d).total + ' ' + hit.reason);
    }
  });

program
  .command('score')
  .description('Show evidence scores for each decision')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (options) => {
    const root = path.resolve(options.root ?? '.');
    const ledger = await readLedger(root);
    for (const d of ledger) {
      const score = scoreDecision(d);
      console.log(d.id + '	' + score.score + '/' + score.total + '	' + d.title);
    }
  });

program
  .command('show <id>')
  .description('Show a decision by id')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (id: string, options) => {
    const root = path.resolve(options.root ?? '.');
    const ledger = await readLedger(root);
    const d = ledger.find((x) => x.id === id);
    if (!d) {
      console.error(`Decision not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(d, null, 2));
  });

program
  .command('search <query>')
  .description('Search decisions')
  .option('-r, --root <path>', 'project root', '.')
  .option('-n, --limit <limit>', 'max results', '10')
  .action(async (query: string, options) => {
    const root = path.resolve(options.root ?? '.');
    const ledger = await readLedger(root);
    const hits = searchLedger(ledger, query).slice(0, Number(options.limit) || 10);
    for (const hit of hits) {
      const d = hit.decision;
      console.log(`${d.id}\t${d.title}\t${hit.reason}`);
    }
  });

program
  .command('graph')
  .description('Render a Mermaid graph of decisions')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (options) => {
    const root = path.resolve(options.root ?? '.');
    const ledger = await readLedger(root);
    const graph = buildGraph(ledger);
    console.log(graph.mermaid);
  });

program
  .command('validate')
  .description('Validate all decisions')
  .option('-r, --root <path>', 'project root', '.')
  .option('--strict', 'fail on any diagnostic, including warnings')
  .action(async (options) => {
    const root = path.resolve(options.root ?? '.');
    const ledger = await readLedger(root);
    const diagnostics = validateLedger(ledger);
    if (!diagnostics.length) {
      console.log('OK: no diagnostics');
      return;
    }
    for (const diag of diagnostics) {
      console.log(`${diag.level.toUpperCase()}\t${diag.id ?? '-'}\t${diag.message}`);
    }
    const shouldFail = diagnostics.some((d) => d.level === 'error') || (options.strict && diagnostics.length > 0);
    if (shouldFail) process.exitCode = 1;
  });

program
  .command('context <query>')
  .description('Build a deterministic decision context bundle for agents or review')
  .option('-f, --format <format>', 'json | markdown', 'markdown')
  .option('-o, --out <path>', 'write to a file instead of stdout')
  .option('-n, --limit <limit>', 'max decisions for text search', '10')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (query: string, options) => {
    const root = path.resolve(options.root ?? '.');
    const bundle = await buildContextBundle(root, query, Number(options.limit) || 10);
    const payload = options.format === "json" ? JSON.stringify(bundle, null, 2) : contextBundleMarkdown(bundle);
    if (options.out) {
      await import('node:fs/promises').then((fs) => fs.writeFile(options.out, payload, 'utf8'));
      console.log('Wrote ' + options.out);
    } else {
      console.log(payload);
    }
  });

program
  .command('conflicts')
  .description('Detect contradictory or incomplete decision relationships')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (options) => {
    const root = path.resolve(options.root ?? '.');
    const ledger = await readLedger(root);
    const conflicts = findConflicts(ledger);
    if (!conflicts.length) {
      console.log('OK: no conflicts');
      return;
    }
    for (const conflict of conflicts) {
      console.log(`${conflict.level.toUpperCase()}\t${conflict.kind}\t${conflict.id ?? "-"}${conflict.related.length ? " -> " + conflict.related.join(",") : ""}\t${conflict.message}`);
    }
    if (conflicts.some((item) => item.level === 'error')) process.exitCode = 1;
  });

program
  .command('import-adr <source-dir>')
  .description('Import existing ADR Markdown files into the Horizon ledger')
  .option('-s, --status <status>', 'override imported status')
  .option('--dry-run', 'preview without writing decisions')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (source: string, options) => {
    const root = path.resolve(options.root ?? '.');
    const report = await importAdrDirectory(root, path.resolve(source), { dryRun: options.dryRun, status: options.status });
    console.log(`Scanned ${report.scanned}, created ${report.created}, skipped ${report.skipped}.`);
    for (const item of report.results) {
      console.log(`${item.action}\t${item.id ?? "-"}\t${item.title}\t${item.file}${item.reason ? " (" + item.reason + ")" : ""}`);
    }
  });

program
  .command('pr-context')
  .description('Build decision context for files changed in a pull request')
  .option('-b, --base <sha>', 'base ref or sha')
  .option('-h, --head <sha>', 'head ref or sha')
  .option('-f, --format <format>', 'json | markdown', 'markdown')
  .option('-o, --out <path>', 'write to a file instead of stdout')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (options) => {
    const root = path.resolve(options.root ?? '.');
    const context = await buildPullRequestContext(root, options.base, options.head);
    const payload = options.format === "json" ? JSON.stringify(context, null, 2) : pullRequestContextMarkdown(context);
    if (options.out) {
      await import('node:fs/promises').then((fs) => fs.writeFile(options.out, payload, 'utf8'));
      console.log('Wrote ' + options.out);
    } else {
      console.log(payload);
    }
  });

program
  .command('audit')
  .description('Verify that decision evidence targets actually exist')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (options) => {
    const root = path.resolve(options.root ?? '.');
    const ledger = await readLedger(root);
    const audit = await auditLedger(ledger, root);
    console.log(`verified=${audit.verified} missing=${audit.missing} external=${audit.external} unverifiable=${audit.unverifiable}`);
    for (const finding of audit.findings) {
      console.log(`${finding.status.toUpperCase()}\t${finding.decisionId}\t${finding.evidenceId}\t${finding.message}`);
    }
    if (audit.missing > 0) process.exitCode = 1;
  });

program
  .command('evidence <id>')
  .description('Add evidence to a decision')
  .option('-t, --type <type>', 'commit | file | link | doc | test | experiment | meeting | session | benchmark', 'link')
  .option('-v, --value <value>', 'evidence value (url, commit, path, etc.)')
  .option('-n, --note <note>', 'evidence note')
  .option('--strength <strength>', 'strong | moderate | weak', 'moderate')
  .option('--hash <hash>', 'expected sha256 hash for local file evidence')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (id: string, options) => {
    const root = path.resolve(options.root ?? '.');
    if (!options.value) {
      console.error('Evidence value is required.');
      process.exitCode = 1;
      return;
    }
    const updated = await addEvidence(root, id, {
      type: options.type,
      value: options.value,
      note: options.note,
      strength: options.strength,
      hash: options.hash,
    });
    if (!updated) {
      console.error(`Decision not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Added evidence to ${updated.id}`);
  });


const workspace = program
  .command('workspace')
  .description('Aggregate and query decisions across multiple Horizon roots');

workspace
  .command('init')
  .description('Initialize a workspace in the current root')
  .option('-n, --name <name>', 'workspace name', 'Horizon Workspace')
  .option('-r, --root <path>', 'workspace root', '.')
  .action(async (options: { name?: string; root?: string }) => {
    const root = path.resolve(options.root ?? '.');
    const config = await initWorkspace(root, options.name);
    console.log(`Initialized ${config.name} with ${config.roots.length} root(s).`);
  });

workspace
  .command('add <target>')
  .description('Add another Horizon ledger to the workspace')
  .option('-n, --name <name>', 'workspace root name')
  .option('-r, --root <path>', 'workspace root', '.')
  .action(async (target: string, options: { name?: string; root?: string }) => {
    const root = path.resolve(options.root ?? '.');
    try {
      const config = await addWorkspaceRoot(root, target, options.name);
      const added = config.roots.at(-1)!;
      console.log(`Added workspace root ${added.id}: ${added.name} (${added.path})`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

workspace
  .command('remove <root>')
  .description('Remove a workspace root by id, name, or path')
  .option('-r, --root <path>', 'workspace root', '.')
  .action(async (target: string, options: { root?: string }) => {
    const root = path.resolve(options.root ?? '.');
    try {
      const removed = await removeWorkspaceRoot(root, target);
      console.log(`Removed workspace root ${removed.id}: ${removed.name}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

workspace
  .command('enable <root>')
  .description('Enable a workspace root by id, name, or path')
  .option('-r, --root <path>', 'workspace root', '.')
  .action(async (target: string, options: { root?: string }) => {
    const root = path.resolve(options.root ?? '.');
    try {
      const config = await enableWorkspaceRoot(root, target);
      const updated = config.roots.find((item) => item.id === target || item.name === target || item.path === target);
      if (updated) console.log(`Enabled workspace root ${updated.id}: ${updated.name}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

workspace
  .command('disable <root>')
  .description('Disable a workspace root by id, name, or path')
  .option('-r, --root <path>', 'workspace root', '.')
  .action(async (target: string, options: { root?: string }) => {
    const root = path.resolve(options.root ?? '.');
    try {
      const config = await disableWorkspaceRoot(root, target);
      const updated = config.roots.find((item) => item.id === target || item.name === target || item.path === target);
      if (updated) console.log(`Disabled workspace root ${updated.id}: ${updated.name}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

workspace
  .command('get <id>')
  .description('Get one workspace decision with root provenance')
  .option('-r, --root <path>', 'workspace root', '.')
  .action(async (id: string, options: { root?: string }) => {
    const root = path.resolve(options.root ?? '.');
    try {
      const found = await getWorkspaceDecision(root, id);
      if (!found) {
        console.error(`Decision not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(found, null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });
workspace
  .command('list')
  .description('Show workspace roots and decision counts')
  .option('-r, --root <path>', 'workspace root', '.')
  .action(async (options: { root?: string }) => {
    const root = path.resolve(options.root ?? '.');
    const config = await readWorkspace(root);
    if (!config) {
      console.error(`No Horizon workspace found at ${root}`);
      process.exitCode = 1;
      return;
    }
    const entries = await readWorkspaceLedger(root, config);
    const summary = workspaceSummary(entries, config);
    console.log(`${summary.name}: ${summary.decisions} decisions`);
    for (const rootSummary of summary.roots) {
      console.log(`${rootSummary.enabled ? 'enabled' : 'disabled'}\t${rootSummary.id}\t${rootSummary.name}\t${rootSummary.path}\t${rootSummary.decisions}`);
    }
  });

workspace
  .command('validate')
  .description('Validate all enabled workspace roots as one ledger')
  .option('-r, --root <path>', 'workspace root', '.')
  .option('--strict', 'fail on warnings as well as errors')
  .action(async (options: { root?: string; strict?: boolean }) => {
    const root = path.resolve(options.root ?? '.');
    try {
      const result = await validateWorkspace(root);
      console.log(`${result.name}: ${result.decisions} decisions, ${result.diagnostics.length} diagnostics`);
      for (const diagnostic of result.diagnostics) {
        console.log(`${diagnostic.level.toUpperCase()}\t${diagnostic.rootName ?? '-'}\t${diagnostic.id ?? '-'}\t${diagnostic.message}`);
      }
      if (!result.ok || (options.strict && result.diagnostics.length > 0)) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

workspace
  .command('audit')
  .description('Verify evidence in all enabled workspace roots')
  .option('-r, --root <path>', 'workspace root', '.')
  .action(async (options: { root?: string }) => {
    const root = path.resolve(options.root ?? '.');
    try {
      const audit = await auditWorkspace(root);
      console.log(`${audit.name}: verified=${audit.verified} missing=${audit.missing} external=${audit.external} unverifiable=${audit.unverifiable}`);
      for (const finding of audit.findings) {
        console.log(`${finding.status.toUpperCase()}\t${finding.rootName}\t${finding.decisionId}\t${finding.evidenceId}\t${finding.message}`);
      }
      for (const diagnostic of audit.diagnostics) {
        console.log(`${diagnostic.level.toUpperCase()}\t${diagnostic.rootName ?? '-'}\t${diagnostic.id ?? '-'}\t${diagnostic.message}`);
      }
      if (!audit.ok) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });
workspace
  .command('context <query>')
  .description('Build deterministic decision context across workspace roots')
  .option('-f, --format <format>', 'json | markdown', 'markdown')
  .option('-o, --out <path>', 'write to a file instead of stdout')
  .option('-r, --root <path>', 'workspace root', '.')
  .action(async (query: string, options: { format?: string; out?: string; root?: string }) => {
    const root = path.resolve(options.root ?? '.');
    try {
      const context = await buildWorkspaceContext(root, query);
      const payload = options.format === 'json'
        ? JSON.stringify(context, null, 2)
        : workspaceContextMarkdown(context);
      const outPath = options.out;
      if (outPath) {
        await import('node:fs/promises').then((fs) => fs.writeFile(outPath, payload, 'utf8'));
        console.log('Wrote ' + options.out);
      } else {
        console.log(payload);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });
workspace
  .command('pr-context')
  .description('Build decision context for changed files across monorepo roots')
  .option('-b, --base <sha>', 'base ref or sha')
  .option('-h, --head <sha>', 'head ref or sha', 'HEAD')
  .option('-f, --format <format>', 'json | markdown', 'markdown')
  .option('-o, --out <path>', 'write to a file instead of stdout')
  .option('-r, --root <path>', 'workspace root', '.')
  .action(async (options: { base?: string; head?: string; format?: string; out?: string; root?: string }) => {
    const root = path.resolve(options.root ?? '.');
    if (!options.base) {
      console.error('A base ref is required.');
      process.exitCode = 1;
      return;
    }
    try {
      const context = await buildWorkspacePullRequestContext(root, options.base, options.head ?? 'HEAD');
      const payload = options.format === 'json'
        ? JSON.stringify(context, null, 2)
        : workspacePullRequestContextMarkdown(context);
      const outPath = options.out;
      if (outPath) {
        await import('node:fs/promises').then((fs) => fs.writeFile(outPath, payload, 'utf8'));
        console.log('Wrote ' + outPath);
      } else {
        console.log(payload);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });
workspace
  .command('export')
  .description('Export workspace decisions, provenance, conflicts, and audit findings')
  .option('-f, --format <format>', 'json | markdown', 'json')
  .option('-o, --out <path>', 'write to a file instead of stdout')
  .option('-r, --root <path>', 'workspace root', '.')
  .action(async (options: { format?: string; out?: string; root?: string }) => {
    const root = path.resolve(options.root ?? '.');
    try {
      const exported = await exportWorkspace(root);
      const payload = options.format === 'markdown'
        ? workspaceExportMarkdown(exported)
        : JSON.stringify(exported, null, 2);
      const outPath = options.out;
      if (outPath) {
        await import('node:fs/promises').then((fs) => fs.writeFile(outPath, payload, 'utf8'));
        console.log('Wrote ' + outPath);
      } else {
        console.log(payload);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });
program
  .command('web')
  .description('Start a local web viewer for the ledger')
  .option('-r, --root <path>', 'project root', '.')
  .option('-p, --port <port>', 'port', '4173')
  .action(async (options) => {
    const root = path.resolve(options.root ?? '.');
    const port = Number(options.port) || 4173;
    await startLedgerServer(root, port);
    console.log('Horizon Ledger web viewer listening on http://127.0.0.1:' + port);
  });


program
  .command('export')
  .description('Export the ledger as JSON or Markdown')
  .option('-r, --root <path>', 'project root', '.')
  .option('-f, --format <format>', 'json | markdown', 'json')
  .option('-o, --out <path>', 'write to a file instead of stdout')
  .action(async (options) => {
    const root = path.resolve(options.root ?? '.');
    const ledger = await readLedger(root);
    const payload = options.format === 'markdown' ? exportMarkdown(ledger) : JSON.stringify(exportLedger(ledger), null, 2);
    if (options.out) {
      await import('node:fs/promises').then((fs) => fs.writeFile(options.out, payload, 'utf8'));
      console.log('Wrote ' + options.out);
    } else {
      console.log(payload);
    }
  });

program
  .command('mcp')
  .description('Run the Model Context Protocol server on stdio')
  .option('-r, --root <path>', 'project root', '.')
  .option('--write', 'enable decision capture and update tools')
  .action(async (options) => {
    const root = path.resolve(options.root ?? '.');
    await startMcpServer(root, { write: options.write });
  });

program.parseAsync(process.argv);
