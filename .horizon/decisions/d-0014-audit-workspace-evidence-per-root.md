---
id: D-0014
title: Audit workspace evidence per root
status: decided
createdAt: 2026-09-26T11:56:55.275Z
updatedAt: 2026-09-26T11:56:56.298Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/workspace.ts
  - src/cli/index.ts
  - src/mcp/index.ts
tags:
  - audit
  - evidence
  - workspaces
owner: Codex
links: []
alternatives:
  - id: A-001
    name: Audit every decision against the workspace root
    verdict: rejected
    reason: Relative evidence paths would resolve to the wrong repository.
  - id: A-002
    name: Fetch external URLs during workspace audit
    verdict: rejected
    reason: Local-first validation should not make network requests by default.
evidence:
  - type: file
    value: src/core/workspace.ts
    note: Workspace audit implementation
    strength: strong
    id: E-001
  - type: file
    value: tests/workspace.test.ts
    note: Workspace audit tests
    strength: strong
    id: E-002
---

## Summary

Workspace audits preserve root provenance and resolve evidence inside its source repository.

## Context

A workspace-wide audit must not resolve ../api/src/foo.ts against the workspace root.

## Decision

Run the deterministic evidence audit separately in each enabled root, then annotate findings with root provenance.

## Consequences

Missing files, commits, and hashes are localized to the owning repository.
