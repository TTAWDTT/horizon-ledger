---
id: D-0005
title: Keep MCP writes opt-in and decision-shaped
status: decided
createdAt: 2026-09-26T10:50:51.079Z
updatedAt: 2026-09-26T10:50:51.466Z
confidence: medium
horizon: medium
kind: engineering
scope:
  - src/mcp
  - src/cli
tags:
  - mcp
  - safety
links: []
alternatives:
  - id: A-001
    name: Enable MCP writes by default
    verdict: rejected
    reason: An unconfigured agent should not be able to mutate decision files.
evidence:
  - type: file
    value: src/mcp/index.ts
    note: MCP write tools and read-only default
    strength: strong
    id: E-001
---

## Summary

Agents can read decisions safely by default, but durable writes are explicit and structured.

## Context

MCP write access can mutate repository files. Generic memory tools often create opaque notes, while decision records need context, alternatives, consequences, and evidence.

## Decision

Expose read-only MCP by default; enable create, update, link, alternative, and evidence tools only with --write or HORIZON_MCP_WRITE=1.

## Consequences

Accidental writes are less likely, while configured agents can capture durable decisions without losing provenance.

