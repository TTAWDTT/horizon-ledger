---
id: D-0003
title: Expose decisions to agents through MCP
status: decided
createdAt: 2026-09-26T09:41:30.407Z
updatedAt: 2026-09-26T09:41:37.580Z
confidence: medium
horizon: medium
kind: engineering
scope:
  - src/mcp
tags:
  - agents
  - mcp
links: []
alternatives:
  - id: A-001
    name: Direct file search by each agent
    verdict: rejected
    reason: Every agent would need custom parsing and the context would remain inconsistent.
evidence:
  - type: file
    value: src/mcp/index.ts
    note: MCP server implementation
    strength: strong
    id: E-001
---

## Summary

Agents can query the same ledger humans use.

## Context

Coding agents need a stable way to ask why decisions were made.

## Decision

Ship an MCP stdio server with list, search, scope, score, and validate tools.

## Consequences

Agent integration without leaking code outside the repo.
