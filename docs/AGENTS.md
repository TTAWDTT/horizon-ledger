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

Available tools:

- `horizon_list`
- `horizon_search`
- `horizon_get`
- `horizon_scope`
- `horizon_graph`
- `horizon_score`
- `horizon_validate`

This gives an agent the same decision context a human reviewer would use.
