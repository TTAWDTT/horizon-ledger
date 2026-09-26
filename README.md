# Horizon Ledger

> A local-first decision ledger for humans and AI agents. Capture **why** decisions were made, prove them with evidence, and query the graph from code, docs, and agents.

Horizon Ledger is a small, composable primitive for AI-assisted engineering: not another note app, but a structured, Git-native **ledger of decisions** that can be read by humans, CI, and coding agents.

It answers questions that ADRs and commit logs usually fail to answer over time:

- Why was this chosen?
- What alternatives were rejected?
- What evidence supports the decision?
- What changed since then?
- What should an agent know before modifying this file?

## Why it exists

Most "why" knowledge dies in three places:

1. ADRs that are separate from code and never maintained.
2. PR descriptions that are unsearchable and hard to connect to other decisions.
3. Slack threads that disappear or lose context.

Horizon Ledger keeps decisions **close to code**, in Markdown + structured front matter, with explicit evidence, provenance, and graph links.

## Install

```bash
bun add horizon-ledger
```

or

```bash
npm install horizon-ledger
```

## Quickstart

```bash
horizon init
horizon add --title "Use SQLite for local storage" --summary "SQLite is simple and portable."
horizon list
horizon show D-0001
horizon update D-0001 --status decided
horizon evidence D-0001 --type link --value https://sqlite.org --note "SQLite docs" --strength strong
horizon search sqlite
horizon why sqlite
horizon score
horizon validate
horizon graph
```

To use it with an MCP-compatible coding agent:

```bash
horizon mcp
```

## What you get

- local-first, Git-friendly Markdown decisions
- structured alternatives, evidence, and provenance
- graph + search + simple evidence scoring
- useful for humans, coding agents, and future CI gates
- no vendor lock-in, no hosted database, no LLM required

## Design principles

- **Local-first**: plain files and plain text. Git is the source of truth.
- **Evidence-aware**: every decision can carry links, commits, docs, tests, and conversations.
- **Agent-compatible**: structured enough for machines, human-readable enough for people.
- **Boring by default**: no magic, no black boxes, no forced workflow.

## Roadmap

- CLI and Markdown ledger (shipped)
- MCP server for coding agents (started)
- local web viewer
- GitHub Action and PR integration
- evidence scoring and conflict detection
- sync protocol and team mode

## Why open source

Horizon Ledger is open source under MIT. The project will be developed and iterated by Codex as a local-first, agent-friendly decision ledger.

## Contributing

Issues and pull requests are welcome. Please keep changes small and evidence-focused.
