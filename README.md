# Horizon Ledger

> A local-first, Git-native decision ledger and workspace for humans and AI agents. Built and iterated by Codex.

[![test](https://github.com/TTAWDTT/horizon-ledger/actions/workflows/test.yml/badge.svg)](https://github.com/TTAWDTT/horizon-ledger/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/v/release/TTAWDTT/horizon-ledger?sort=semver)](https://github.com/TTAWDTT/horizon-ledger/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

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

Install the latest tagged Git release:

```bash
bun add github:TTAWDTT/horizon-ledger#v0.26.0
```

or

```bash
npm install github:TTAWDTT/horizon-ledger#v0.26.0
```

## Quickstart

```bash
horizon init --mcp
horizon add --title "Use SQLite for local storage" --summary "SQLite is simple and portable."
horizon list
horizon show D-0001
horizon update D-0001 --status decided
horizon evidence D-0001 --type link --value https://sqlite.org --note "SQLite docs" --strength strong
horizon seal D-0001 E-001
horizon search sqlite
horizon why sqlite
horizon scope src/core
horizon score
horizon validate
horizon graph
horizon import-adr docs/adr --dry-run
horizon context src/core
horizon pr-context --base main --head HEAD
horizon trace --base main --head HEAD
horizon gate --base main --head HEAD
horizon export --format markdown --out DECISIONS.md

horizon doctor
horizon web
```

## Change gate

See [docs/POLICY.md](docs/POLICY.md) for opt-in decision policies.

## Commit trace and attribution

Horizon can connect implementation history to decisions instead of treating any commit hash as proof:

```bash
horizon trace --base v0.25.0 --head HEAD
horizon trace --base main --head HEAD --decision D-0001 --format json
```

The trace classifies a commit as `evidence` when its SHA is attached, `reference` when the commit message names the decision, and `scope` when it touches the decision scope. The read-only `horizon_trace` MCP tool exposes the same result to agents.

Use `requireEvidence: attributed` when a policy must be enforced by an implementation commit:

```yaml
policy:
  mode: block
  requireEvidence: attributed
```

This accepts a commit that touches the decision scope or names the decision in its message. It still treats Git history as immutable local evidence; it does not fetch from a remote or invent proof.

## Multi-root workspaces

See [docs/PACKS.md](docs/PACKS.md) for the deterministic pack format.

```bash
horizon workspace init
horizon workspace add ../another-repo --name another-repo
horizon workspace list
horizon workspace disable ../another-repo
horizon workspace enable ../another-repo
horizon workspace remove ../another-repo
horizon workspace get D-0001
horizon workspace validate
horizon workspace audit
horizon workspace pr-context --base main --head HEAD
horizon workspace gate --base main --head HEAD
horizon workspace export --format markdown --out WORKSPACE.md
horizon workspace pack export --out WORKSPACE-PACK.json
horizon workspace pack import WORKSPACE-PACK.json
horizon workspace context storage

horizon workspace evidence export --out EVIDENCE-PACK.json
horizon workspace evidence verify EVIDENCE-PACK.json --expect-verdict pass
```

The MCP server also exposes read-only `horizon_workspace_list`, `horizon_workspace_audit`, `horizon_workspace_context`, `horizon_workspace_validate`, `horizon_workspace_gate`, `horizon_workspace_pack_export`, `horizon_workspace_pack_import_plan`, `horizon_workspace_evidence_export`, and `horizon_workspace_evidence_verify` tools, so coding agents can query cross-root decisions without a cloud service. Workspace packs and evidence packages are deterministic and SHA-256-bound, so you can review, archive, or hand off decisions without a cloud service. Pack import defaults to a read-only plan; add --write to apply it. Workspace configs are validated strictly: duplicate IDs, names, and aliases fail fast instead of silently degrading into a partial graph.

To run a local decision dashboard:

```bash
horizon web --port 4173
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173). The viewer includes:

- a status and quality board
- alternatives, evidence, links, scope, tags, and diagnostics
- a local decision/evidence graph
- search over decisions, evidence, alternatives, and scope

The viewer is served on `127.0.0.1`, uses no remote assets, and reads from the Git-native files on every request.

To expose the ledger to an MCP-compatible coding agent:

```bash
horizon mcp
```

Read-only is the default. To allow decision capture, use `horizon mcp --write`.

## What you get

- local-first, Git-friendly Markdown decisions
- structured alternatives, evidence, provenance, and optional sha256 seals
- graph, search, scoring, cross-repository workspaces, and portable packs
- a local-only human dashboard with no telemetry
- optional sha256 evidence seals, commit attribution, hash-bound gate reports, SARIF output, and portable evidence packages
- useful for humans, coding agents, and opt-in CI gates
- no vendor lock-in, no hosted database, no LLM required

## Design principles

- **Local-first**: plain files and plain text. Git is the source of truth.
- **Evidence-aware**: every decision can carry links, commits, docs, tests, and conversations.
- **Agent-compatible**: structured enough for machines, human-readable enough for people.
- **Boring by default**: no magic, no black boxes, no forced workflow.

## Roadmap

- CLI and Markdown ledger (shipped)
- MCP server with tools, resources, and governed prompts (shipped)
- local web dashboard (shipped)
- GitHub Action validation (shipped)
- cross-repository workspace aggregation (shipped)
- ADR import (shipped)
- policy/evidence change gates, attributed commits, sha256 seals, hash-bound reports, and SARIF output (shipped)
- token-budgeted decision context packs and PR context (shipped)
- portable workspace packs and decision evidence packages (shipped)

## Why open source

Horizon Ledger is open source under MIT. The project will be developed and iterated by Codex as a local-first, agent-friendly decision ledger.

## Contributing

Issues and pull requests are welcome. Please keep changes small and evidence-focused.

## CI validation

Add this step to a workflow:

```yaml
- uses: TTAWDTT/horizon-ledger/.github/actions/validate@main
  with:
    root: .
    strict: true
```

The Action installs Horizon from this repository and runs the same decision validator used by the CLI, so warnings and errors fail before the PR is merged.

To enforce opt-in policies, add the gate Action:

```yaml
- uses: TTAWDTT/horizon-ledger/.github/actions/gate@main
  with:
    base-sha: ${{ github.event.pull_request.base.sha }}
    head-sha: ${{ github.event.pull_request.head.sha }}
    root: .
    artifact: true
```

To retain the decisions and gate verdict as one artifact, add the evidence Action:

```yaml
- uses: TTAWDTT/horizon-ledger/.github/actions/evidence@main
  with:
    base-sha: ${{ github.event.pull_request.base.sha }}
    head-sha: ${{ github.event.pull_request.head.sha }}
    root: .
    artifact: true
```



