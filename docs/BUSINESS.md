# Business model

Horizon Ledger is open source, local-first, and boring by default. The goal is not to lock users into a hosted tool, but to make the **open core** genuinely useful on its own.

## Free forever

- local Markdown/YAML ledger
- CLI
- MCP server
- local web viewer
- cross-repository workspaces
- evidence audits
- monorepo pull-request context
- conflict detection
- ADR importer
- export formats
- deterministic workspace packs and evidence packages

## Possible paid extensions

These are only useful if the core earns daily use:

1. **Team sync**: encrypted sync between repos and workspaces beyond the free Git-native workflow.
2. **Private dashboard**: hosted graph, conflict detection, and audit views.
3. **Compliance packs**: SOC2/ISO-style export with organization mappings, review trails, and signed audit bundles.
4. **Agent packs**: opinionated templates for specific stacks and workflows.

The project should not invent a cloud dependency until the local primitive is strong enough that teams would actually want it.

## Path to revenue

1. Let the free core prove itself in individual repos, agents, and CI.
2. Use workspaces to demonstrate real cross-repository value.
3. Add paid collaboration only when a team asks for: shared private views, policy gates, compliance exports, and identity-scoped writes.
4. Keep the local ledger importable and exportable so paid extensions never become a hostage scenario.