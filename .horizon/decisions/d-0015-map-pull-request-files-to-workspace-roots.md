---
id: D-0015
title: Map pull request files to workspace roots
status: decided
createdAt: 2026-09-26T12:03:53.741Z
updatedAt: 2026-09-26T12:39:02.169Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/workspace.ts
  - src/cli/index.ts
  - .github/actions/pr-context/action.yml
  - .github/actions/validate/action.yml
tags: []
owner: Codex
links: []
alternatives:
  - id: A-001
    name: Query every root with every changed file
    verdict: rejected
    reason: Cross-repo scopes could match unrelated package paths and produce noisy context.
  - id: A-002
    name: Run separate PR contexts per root
    verdict: rejected
    reason: It would lose a single review surface and duplicate the same changed files.
evidence:
  - type: file
    value: src/core/workspace.ts
    note: Workspace PR context implementation
    strength: strong
    id: E-001
  - type: file
    value: tests/workspace.test.ts
    note: Workspace PR context test
    strength: strong
    id: E-002
  - type: file
    value: .github/actions/pr-context/action.yml
    note: Workspace PR context action input
    strength: moderate
    id: E-003
  - type: file
    value: .github/actions/validate/action.yml
    note: Workspace validation action input
    strength: moderate
    id: E-004
---

## Summary

Workspace PR context maps monorepo changed paths to each owning root before matching decision scopes.

## Context

A single pull request can touch multiple packages, and each package may own different decisions.

## Decision

List changed files at the workspace Git root, map each file to enabled roots by relative path, then apply the existing file relevance and audit rules per root.

## Consequences

Monorepo pull requests get provenance-aware decisions without duplicating context across roots.
