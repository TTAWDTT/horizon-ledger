---
id: D-0012
title: Aggregate local roots into a workspace
status: decided
createdAt: 2026-09-26T11:47:37.515Z
updatedAt: 2026-09-26T11:47:38.627Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/workspace.ts
  - src/cli/index.ts
tags:
  - workspaces
  - provenance
owner: Codex
links: []
alternatives:
  - id: A-001
    name: Cloud-hosted team workspace
    verdict: rejected
    reason: It would add vendor dependency before the local primitive earns team use.
  - id: A-002
    name: Copy decisions into one central store
    verdict: rejected
    reason: Copying loses Git-native ownership and root provenance.
evidence:
  - type: file
    value: src/core/workspace.ts
    note: Workspace aggregation implementation
    strength: strong
    id: E-001
  - type: file
    value: tests/workspace.test.ts
    note: Workspace behavior tests
    strength: strong
    id: E-002
---

## Summary

Horizon workspaces join several local roots while preserving provenance.

## Context

Teams and monorepos make decisions across more than one repository or package, but most ADR tools stop at one root.

## Decision

Add a local workspace config, read-only aggregation, search, diagnostics, and deterministic context output.

## Consequences

Agents can query cross-repository decisions without a hosted service.

