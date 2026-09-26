---
id: D-0017
title: Resolve workspace decisions by ID with provenance
status: decided
createdAt: 2026-09-26T12:33:27.520Z
updatedAt: 2026-09-26T12:33:29.331Z
confidence: high
horizon: medium
kind: engineering
scope: []
tags: []
owner: Codex
links: []
alternatives:
  - id: A-001
    name: Return only the Decision object
    verdict: rejected
    reason: It would lose the provenance needed in a workspace.
  - id: A-002
    name: Search by ID across all roots and return every match
    verdict: rejected
    reason: A single workspace get should surface duplicate-ID diagnostics instead of silently returning several records.
evidence:
  - type: file
    value: src/core/workspace.ts
    note: Workspace get implementation
    strength: strong
    id: E-001
  - type: file
    value: src/mcp/index.ts
    note: Workspace get MCP tool
    strength: strong
    id: E-002
  - type: file
    value: tests/workspace.test.ts
    note: Workspace get tests
    strength: strong
    id: E-003
---

## Summary

Workspace get returns a single decision together with its owning root.

## Context

After a cross-root search, agents and reviewers need to fetch the exact source without scanning every repository.

## Decision

Add a read-only workspace get API, CLI command, and MCP tool that preserve root id, name, and path.

## Consequences

Cross-root lookups remain deterministic and do not expose write access beyond the owning ledger.
