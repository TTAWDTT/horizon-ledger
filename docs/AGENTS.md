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

## Write tools

Enabled only with `horizon mcp --write` or `HORIZON_MCP_WRITE=1`.

- `horizon_create` — require context, decision, consequences, at least one alternative, and optional evidence
- `horizon_update` — patch selected fields without erasing omitted fields
- `horizon_link` — relate, supersede, or express dependencies between decisions
- `horizon_add_alternative` — record another considered option
- `horizon_add_evidence` — attach commits, files, docs, tests, benchmarks, meetings, or sessions

This gives an agent the same decision context a human reviewer would use and keeps durable decisions in Git rather than an opaque memory store.
