---
id: D-0020
title: Plan workspace pack imports before writing
status: decided
createdAt: 2026-09-26T13:47:07.175Z
updatedAt: 2026-09-26T13:47:07.175Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/pack.ts
  - src/cli/index.ts
  - src/mcp/index.ts
tags: []
owner: Codex
links:
  - id: D-0019
    type: depends_on
    note: Import planning extends the deterministic pack envelope.
alternatives:
  - id: A-001
    name: Write imported decisions immediately
    verdict: rejected
    reason: Silent writes would make cross-machine handoff unsafe and hard to review.
  - id: A-002
    name: Merge decisions into an existing root
    verdict: rejected
    reason: It would blur source-root provenance and increase ID collision risk.
  - id: A-003
    name: Import into a hidden internal store
    verdict: rejected
    reason: Decisions should remain plain Markdown in Git, not opaque tool state.
evidence:
  - type: file
    value: src/core/pack.ts
    note: Read-only import plan, explicit write mode, and conflict detection
    strength: strong
    id: E-001
  - type: file
    value: src/cli/index.ts
    note: Pack import command with explicit --write
    strength: strong
    id: E-002
  - type: file
    value: src/mcp/index.ts
    note: Read-only workspace pack import plan tool
    strength: strong
    id: E-003
  - type: file
    value: tests/workspace-pack.test.ts
    note: Idempotent import and conflicting-ID regression tests
    strength: strong
    id: E-004
---

## Summary

Workspace pack imports now plan first, write only with an explicit flag, and preserve source-root provenance in an import root.

## Context

A pack can cross machine, team, and repository boundaries. Writing it blindly could overwrite reviewed decisions or create duplicate IDs. Agentpack's portable bundle model showed that explicit planning plus an opt-in apply is the safer local-first contract.

## Decision

Default `workspace pack import` to a read-only plan. Require `--write` to apply. Create one deterministic import root per source root, reuse unchanged decisions, and block conflicting decision IDs. Expose the same planning behavior to agents as a read-only MCP tool.

## Consequences

Teams can preview and review every write before it happens. Re-importing the same pack is idempotent, while a conflicting decision fails fast with structured diagnostics instead of silently replacing local history.
