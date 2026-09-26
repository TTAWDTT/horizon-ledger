---
id: D-0018
title: Harden workspace config and root management
status: decided
createdAt: 2026-09-26T13:15:52.699Z
updatedAt: 2026-09-26T13:15:52.699Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/workspace.ts
  - src/cli/index.ts
  - tests/workspace.test.ts
tags: []
owner: Codex
links:
  - id: D-0012
    type: depends_on
    note: Strict validation protects the workspace aggregation contract.
alternatives:
  - id: A-001
    name: Keep treating malformed configs as missing
    verdict: rejected
    reason: That conflated a missing workspace with corruption and allowed accidental regeneration.
  - id: A-002
    name: Report config issues as soft warnings
    verdict: rejected
    reason: Agents could still aggregate the wrong roots or overwrite the file.
  - id: A-003
    name: Add schema-only validation
    verdict: rejected
    reason: It would not catch duplicate names, IDs, aliases, or unsafe metadata paths with structured diagnostics.
evidence:
  - type: file
    value: src/core/workspace.ts
    note: Workspace config parser, validator, and root mutations
    strength: strong
    id: E-001
  - type: file
    value: src/cli/index.ts
    note: Remove, enable, and disable commands
    strength: strong
    id: E-002
  - type: file
    value: tests/workspace.test.ts
    note: Invalid-config and root lifecycle tests
    strength: strong
    id: E-003
---

## Summary

Workspace configs are now validated structurally, and roots can be removed, enabled, or disabled explicitly.

## Context

The workspace is becoming the cross-repository integration surface. A malformed root entry, duplicate ID, duplicate name, alias, or invalid enabled value previously degraded to "no workspace found" instead of a precise diagnostic. That made the safe local-first foundation for sync and audit weaker.

## Decision

Parse workspace JSON into structured config issues; reject duplicate IDs, names, and resolved paths; require relative ledger root paths; and validate on write. Add root management APIs and CLI commands for remove, enable, and disable by ID, name, or path.

## Consequences

Agents and CI fail fast with actionable config diagnostics. Workspace edits remain explicit, local, reviewable, and reversible through Git without requiring a central service.
