# Changelog

## 0.14.0

- Added an opt-in evidence-aware change gate with `observe`, `review`, and `block` policies.
- Added `horizon gate` and the read-only `horizon_gate` MCP tool.
- Added policy metadata validation for mode and evidence requirements.
- Enabled MCP write tools to create and update decision policies.

## 0.13.0

- Added read-only workspace pack import planning and explicit `--write` apply.
- Added `horizon workspace pack import` and `horizon_workspace_pack_import_plan` MCP tool.
- Added deterministic imported-root provenance and conflicting decision-ID blocking.

## 0.12.0

- Added deterministic, hash-bound Horizon workspace packs.
- Added `horizon workspace pack export`, `horizon workspace pack inspect`, and the read-only `horizon_workspace_pack_export` MCP tool.

## 0.11.0

- Added strict workspace config validation for duplicate IDs, duplicate names, duplicate resolved paths, unsafe metadata paths, and invalid enabled values.
- Added `horizon workspace remove`, `enable`, and `disable` for explicit local root management.
- Added structured `WorkspaceConfigError` diagnostics and protected existing configs from accidental regeneration.

## 0.10.0

- Added Horizon workspaces for aggregating multiple local decision roots.
- Added `horizon workspace init`, `add`, `get`, `list`, `validate`, and `context`.
- Added workspace diagnostics for duplicate IDs, missing roots, and cross-root conflicts.
- Added deterministic cross-repository agent context with root provenance.
- Added cross-root evidence auditing with `horizon workspace audit` and `horizon_workspace_audit` MCP.
- Added monorepo-aware `horizon workspace pr-context` for changed files across roots.
- Added `horizon workspace export` for provenance-aware Markdown and JSON reports.
- Added read-only `horizon_workspace_list`, `horizon_workspace_audit`, `horizon_workspace_context`, and `horizon_workspace_validate` MCP tools.

## 0.9.0

- Added horizon pr-context for deterministic pull request context.
- Added a reusable GitHub Action that comments with decisions for changed files.


- Added deterministic decision context bundles for files and text queries.
- Added `horizon context` CLI and `horizon_context` MCP read tool.

## 0.7.0

- Added evidence audit for local paths, Git commits, external URLs, and sha256-sealed files.
- Added `horizon audit` CLI, `horizon_audit` MCP tool, and structured audit API.
- Added optional sha256 hash to evidence.

## 0.6.0

- Added a safe ADR Markdown importer with dry-run, evidence preservation, alternatives, and skip-on-repeat.

## 0.5.0

- Added deterministic conflict detection for accepted and rejected alternatives in overlapping scopes.
- Added incomplete supersession diagnostics.
- Added `horizon conflicts` CLI and `horizon_conflicts` MCP read tool.

## 0.4.0

- Added opt-in MCP write tools for decision capture and updates.
- Enforced alternatives and evidence-aware decision capture in MCP writes.
- Kept the default MCP server read-only for safety.
- Added a reusable GitHub Action for strict ledger validation.

## 0.3.0

- Rebuilt the local web viewer as a decision dashboard.
- Added local board view with status, quality, scope, and tags.
- Added detailed alternatives, evidence, links, diagnostics, and quality reasons.
- Added a dependency-free decision/evidence graph view.
- Added structured `/api/ledger` metadata, scores, stats, and health endpoint.

## 0.2.4

- Synced the CLI version with the package.

## 0.2.3

- Added JSON and Markdown ledger export.
- Made `why` queries path-aware.

## 0.2.2

- Added decision relationships and graph links.

## 0.2.1

- Added MCP config generation on `init --mcp`.

## 0.2.0

- Added local web viewer.
- Added CLI commands for `scope`, `why`, and `score`.

## 0.1.0

- Initial local-first decision ledger CLI and core.
