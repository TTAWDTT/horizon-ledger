# Agent integration

Horizon Ledger can be used as an MCP server.

```json
{
  "mcpServers": {
    "horizon-ledger": {
      "command": "npx",
      "args": ["horizon-ledger", "mcp", "--root", "."]
    }
  }
}
```

The server is read-only by default. Add `--write` only when you want the agent to record decisions:

```json
{
  "mcpServers": {
    "horizon-ledger": {
      "command": "npx",
      "args": ["horizon-ledger", "mcp", "--root", ".", "--write"]
    }
  }
}
```

## Read tools

- `horizon_list`
- `horizon_search`
- `horizon_get`
- `horizon_scope`
- `horizon_graph`
- `horizon_score`
- `horizon_validate`
- `horizon_conflicts`
- `horizon_audit`
- `horizon_workspace_get` — fetch one decision with root provenance
- `horizon_workspace_list` — show root provenance and counts across a workspace
- `horizon_workspace_audit` — audit evidence with root provenance
- `horizon_workspace_context` — search decisions across enabled roots with root metadata
- `horizon_workspace_validate` — validate workspace roots and cross-root conflicts
- `horizon_workspace_pack_export` — export a deterministic, hash-bound workspace pack
- `horizon_workspace_pack_import_plan` — plan an import without writing
- `horizon_gate` — check changed paths against opt-in decision policies
- `horizon_workspace_gate` — check monorepo paths against policies in every enabled root
- `horizon_verify_gate_report` — verify a raw hash-bound gate report and its optional verdict/digest expectations
- `horizon_workspace_evidence_export` — export a portable decision evidence package
- `horizon_workspace_evidence_verify` — verify the package, embedded pack, embedded report, and statement subjects
- `horizon_workspace_release_export` — export decisions, gate report, and commit trace as one release audit
- `horizon_workspace_release_inspect` — validate and summarize a raw release audit
- `horizon_workspace_release_verify` — verify a release audit and its embedded artifact expectations
- `horizon_context` — optionally pack context within a token budget
- `horizon_trace` — trace commits to decisions by evidence, scope, or message reference
- `horizon_workspace_trace` — trace workspace commits with root provenance

## Write tools

Enabled only with `horizon mcp --write` or `HORIZON_MCP_WRITE=1`.

- `horizon_create` — require context, decision, consequences, at least one alternative, optional evidence, and an optional gate policy
- `horizon_update` — patch selected fields without erasing omitted fields
- `horizon_link` — relate, supersede, or express dependencies between decisions
- `horizon_add_alternative` — record another considered option
- `horizon_add_evidence` — attach commits, files, docs, tests, benchmarks, meetings, or sessions
- `horizon_seal_evidence` — bind a local evidence file to its current sha256 content

Workspace tools are read-only in every mode; decision writes remain scoped to a single root. This gives an agent the same decision context a human reviewer would use and keeps durable decisions in Git rather than an opaque memory store.

## Resources

MCP hosts can also browse Horizon context as read-only resources:

- `horizon://decisions` — JSON list of decisions
- `horizon://decisions/{id}` — one decision with evidence and policy
- `horizon://workspace/pack` — deterministic, hash-bound workspace pack

## Prompts

MCP hosts can invoke the same governed workflow as user-selected prompts:

- `horizon_change_review` — inspect decisions and run the policy gate before a change
- `horizon_decision_capture` — capture a durable decision with alternatives, evidence, and policy
- `horizon_release_audit` — audit a release range with gate and evidence tools



