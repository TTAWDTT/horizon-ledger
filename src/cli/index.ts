#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import {
  readLedger,
  createDecision,
  updateDecision,
  addEvidence,
  validateLedger,
  searchLedger,
  buildGraph,
  scoreDecision,
} from '../core';
import { initLedger } from '../core/ledger';
import { startMcpServer } from '../mcp';

const program = new Command();

program
  .name('horizon')
  .description('Local-first decision ledger for humans and AI agents.')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a new Horizon Ledger in the current directory.')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (options: { root?: string }) => {
    const root = path.resolve(options.root ?? '.');
    await initLedger(root);
    console.log(`Initialized Horizon Ledger at ${root}`);
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
  .command('why <query>')
  .description('Answer "why" questions by searching the decision ledger')
  .option('-r, --root <path>', 'project root', '.')
  .option('-n, --limit <limit>', 'max results', '3')
  .action(async (query: string, options) => {
    const root = path.resolve(options.root ?? '.');
    const ledger = await readLedger(root);
    const hits = searchLedger(ledger, query).slice(0, Number(options.limit) || 3);
    for (const hit of hits) {
      const d = hit.decision;
      console.log(d.id + ' ' + d.title);
      console.log('  ' + (d.decision || d.summary || 'No decision text'));
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
  .command('evidence <id>')
  .description('Add evidence to a decision')
  .option('-t, --type <type>', 'commit | file | link | doc | test | experiment | meeting | session | benchmark', 'link')
  .option('-v, --value <value>', 'evidence value (url, commit, path, etc.)')
  .option('-n, --note <note>', 'evidence note')
  .option('--strength <strength>', 'strong | moderate | weak', 'moderate')
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
    });
    if (!updated) {
      console.error(`Decision not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Added evidence to ${updated.id}`);
  });

program
  .command('mcp')
  .description('Run the Model Context Protocol server on stdio')
  .option('-r, --root <path>', 'project root', '.')
  .action(async (options) => {
    const root = path.resolve(options.root ?? '.');
    await startMcpServer(root);
  });

program.parseAsync(process.argv);
