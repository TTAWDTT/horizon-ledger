# Change gate

The Horizon change gate is a deterministic check for files that are about to change or have already changed. It does not replace tests, reviews, or branch protection. It answers one narrow question: does a governed decision currently allow this change?

```bash
horizon gate --base main --head HEAD
horizon gate --file src/core/storage.ts
horizon gate --base main --head HEAD --format json
```

## Policy field

Policies are opt-in. A decision without `policy` is context only:

```yaml
policy:
  mode: block
  requireEvidence: verified
```

- `mode: observe` records context but never fails.
- `mode: review` warns.
- `mode: block` fails when the policy requirements are not met.
- `requireEvidence: any` accepts any attached evidence.
- `requireEvidence: verified` requires at least one locally verified evidence target.
- `requireEvidence: strong` requires verified evidence with `strength: strong`.
- `requireEvidence: sealed` requires verified evidence bound to content: a Git commit or a local file with a matching sha256 hash.

Create a local file seal with `horizon seal D-0001 E-001`, or set `hash` when adding evidence. If the target changes, the gate fails until it is deliberately resealed with `--force`.

A blocking decision must be `decided` and have the requested evidence. Missing evidence, non-decided status, and relevant conflicts become gate findings. Invalid policy metadata is reported as a validation error instead of being silently ignored.

## MCP

Agents can call `horizon_gate` with changed paths or a base/head range. It is read-only and returns structured findings, so a host can decide whether to warn, stop, or continue with human review. With MCP writes enabled, `horizon_create` and `horizon_update` can set the same policy field.

## Workspaces

For a monorepo, run the workspace gate instead. It maps repository-relative paths to each enabled root and reports violations with root provenance:

```bash
horizon workspace gate --base main --head HEAD
```

The read-only `horizon_workspace_gate` MCP tool uses the same deterministic evaluation.

## CI

For a single root, add a reusable gate step:

```yaml
- uses: TTAWDTT/horizon-ledger/.github/actions/gate@main
  with:
    base-sha: ${{ github.event.pull_request.base.sha }}
    head-sha: ${{ github.event.pull_request.head.sha }}
```

For a monorepo, set `workspace: true`. The gate exits non-zero on `block`; use `mode: review` for advisory warnings.
