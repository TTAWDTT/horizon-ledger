---
id: D-0013
title: Expose workspace context to MCP agents
status: decided
createdAt: 2026-09-26T11:52:35.957Z
updatedAt: 2026-09-26T11:52:37.099Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/mcp/index.ts
tags:
  - agents
  - mcp
  - workspaces
owner: Codex
links: []
alternatives:
  - id: A-001
    name: Enable workspace writes through MCP
    verdict: rejected
    reason: A first workspace release should be read-only and avoid surprising cross-root writes.
  - id: A-002
    name: Launch a separate workspace MCP server
    verdict: rejected
    reason: A separate process adds setup cost without changing the data ownership model.
evidence:
  - type: file
    value: src/mcp/index.ts
    note: Workspace MCP tools
    strength: strong
    id: E-001
  - type: file
    value: tests/mcp.test.ts
    note: MCP integration test
    strength: strong
    id: E-002
---

## Summary

Agents can list, search, and validate workspace decisions over MCP.

## Context

The workspace core is useful to humans, but coding agents need the same provenance through their native tool interface.

## Decision

Add three read-only workspace MCP tools and keep workspace aggregation separate from single-root write tools.

## Consequences

Agents can answer cross-repository why questions without gaining cross-root write access.
