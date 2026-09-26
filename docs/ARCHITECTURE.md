# Architecture

Horizon Ledger is intentionally small.

- `src/core` owns data structures, Markdown parsing, scoring, validation, search, and export.
- `src/cli` is a thin command layer over core.
- `src/mcp` exposes the same ledger to MCP-compatible coding agents.
- `src/web` serves a local-only dashboard from a dependency-free HTML and JavaScript shell.
- `.horizon/decisions` is the Git-native storage format.

The core never talks to a remote service. The CLI, MCP server, and local dashboard can be embedded in other tools.
