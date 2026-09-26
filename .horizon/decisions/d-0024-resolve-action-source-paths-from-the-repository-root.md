---
id: D-0024
title: Resolve Action source paths from the repository root
status: decided
createdAt: 2026-09-26T14:36:44.365Z
updatedAt: 2026-09-26T14:37:17.691Z
confidence: high
horizon: short
kind: engineering
scope:
  - .github/actions/gate/action.yml
  - .github/actions/pr-context/action.yml
  - .github/actions/validate/action.yml
  - tests/actions.test.ts
tags: []
owner: Codex
links:
  - id: D-0023
    type: depends_on
    note: Fixes the first use of the reusable gate Action.
alternatives:
  - id: A-001
    name: Copy package.json and src into each action
    verdict: rejected
    reason: This would triple build artifacts and drift between actions.
  - id: A-002
    name: Run from github.workspace instead of action_path
    verdict: rejected
    reason: User workflows do not contain the Horizon source tree.
  - id: A-003
    name: Keep separate per-action package.json files
    verdict: rejected
    reason: Extra install surfaces would slow CI and complicate releases.
policy:
  mode: block
  requireEvidence: verified
evidence:
  - id: E-001
    type: file
    value: .github/actions/gate/action.yml
    note: Gate source resolution
    strength: strong
  - id: E-002
    type: file
    value: .github/actions/pr-context/action.yml
    note: PR context source resolution
    strength: strong
  - id: E-003
    type: file
    value: .github/actions/validate/action.yml
    note: Validation source resolution
    strength: strong
  - type: test
    value: tests/actions.test.ts
    note: Asserts every Action resolves the source root CLI
    strength: strong
    id: E-004
---

## Summary

Composite Actions under .github/actions must resolve Horizon source three levels up, not from the action directory.

## Context

CI failed because the gate Action looked for `.github/actions/gate/src/cli/index.ts`. The same path pattern affected the validate and PR-context Actions, so external use would also fail.

## Decision

Replace `ACTION_PATH/src` with `ACTION_PATH/../../../src` in every composite Action. Keep dependencies installed at the repository root and run the source CLI from that root.

## Consequences

The gate, PR-context, and validation Actions work both inside this repository and when referenced from user workflows. Future Actions must use the same repository-root-relative path.
