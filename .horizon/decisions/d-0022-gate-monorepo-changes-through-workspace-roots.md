---
id: D-0022
title: Gate monorepo changes through workspace roots
status: decided
createdAt: 2026-09-26T14:30:09.201Z
updatedAt: 2026-09-26T14:30:09.508Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/workspace.ts
  - src/cli/index.ts
  - src/mcp/index.ts
  - tests/workspace.test.ts
  - docs/POLICY.md
  - README.md
  - docs/USAGE.md
  - docs/AGENTS.md
tags:
  - workspace
  - policy
  - ci
owner: Codex
links:
  - id: D-0021
    type: depends_on
    note: Workspace gate reuses the single-root policy evaluation.
alternatives:
  - id: A-001
    name: Copy single-root gate code into workspace
    verdict: rejected
    reason: That would duplicate evidence and conflict behavior.
  - id: A-002
    name: Only run one gate per package manually
    verdict: rejected
    reason: Agents and CI would need to know all root mappings.
  - id: A-003
    name: Use an LLM to infer package ownership
    verdict: rejected
    reason: Gate outcomes must stay deterministic and reproducible.
policy:
  mode: block
  requireEvidence: verified
evidence:
  - id: E-001
    type: file
    value: src/core/workspace.ts
    note: Workspace gate aggregation and provenance
    strength: strong
  - id: E-002
    type: file
    value: src/cli/index.ts
    note: Workspace gate command
    strength: strong
  - id: E-003
    type: file
    value: src/mcp/index.ts
    note: Read-only workspace gate tool
    strength: strong
  - id: E-004
    type: test
    value: tests/workspace.test.ts
    note: Covers pass, block, coverage, and provenance
    strength: strong
  - id: E-005
    type: doc
    value: docs/POLICY.md
    note: Documents the workspace gate contract
    strength: strong
---

## Summary

The workspace gate maps changed paths to enabled roots and reports per-root policy violations.

## Context

Monorepo decisions are local to each package root, so a single-root gate can miss governed paths. Existing workspace PR mapping already solves path routing without duplicating decision logic.

## Decision

Add `horizon workspace gate` and the read-only `horizon_workspace_gate` MCP tool. Reuse `buildChangeGate` per enabled workspace root, preserve root provenance, and propagate errors and warnings into one workspace verdict.

## Consequences

Teams can enforce evidence-backed decisions across packages with one CI command. Changed paths outside workspace roots remain ungoverned rather than silently approved.
