---
id: D-0026
title: Add sha256 evidence seals
status: decided
createdAt: 2026-09-26T14:49:51.192Z
updatedAt: 2026-09-26T14:50:54.760Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/audit.ts
  - src/core/ledger.ts
  - src/core/policy.ts
  - src/core/types.ts
  - src/core/validate.ts
  - src/cli/index.ts
  - src/mcp/index.ts
  - tests/audit.test.ts
  - tests/policy.test.ts
  - tests/mcp.test.ts
  - docs/POLICY.md
  - docs/USAGE.md
  - docs/AGENTS.md
  - README.md
  - package.json
  - CHANGELOG.md
tags: []
owner: Codex
links:
  - id: D-0021
    type: depends_on
    note: Sealed evidence becomes another gate requirement.
alternatives:
  - id: A-001
    name: Treat file existence as enough
    verdict: rejected
    reason: It hides silent content drift.
  - id: A-002
    name: Require every evidence item to be sealed
    verdict: rejected
    reason: External links and meetings often have no deterministic local seal.
  - id: A-003
    name: Fetch and hash remote URLs
    verdict: rejected
    reason: Horizon should not make network calls or retain remote content silently.
policy:
  mode: block
  requireEvidence: verified
evidence:
  - id: E-001
    type: file
    value: src/core/policy.ts
    note: Sealed policy gate check
    strength: strong
  - id: E-002
    type: file
    value: src/core/ledger.ts
    note: Evidence seal command core
    strength: strong
  - id: E-003
    type: file
    value: src/core/audit.ts
    note: Sealed audit findings
    strength: strong
  - id: E-004
    type: test
    value: tests/audit.test.ts
    note: Seal, drift detection, and forced reseal tests
    strength: strong
  - id: E-005
    type: test
    value: tests/policy.test.ts
    note: Sealed gate pass and drift block tests
    strength: strong
---

## Summary

A file target that can drift silently is not strong enough for governance, so policies can now require sealed evidence.

## Context

Existing verified evidence only proves a target exists. Silent edits to a benchmark result or proof document would still pass a gate. Local hash sealing and Git commit objects provide deterministic content binding without a network dependency.

## Decision

Add `requireEvidence: sealed` and a `horizon seal <decision> <evidence>` command. Audit findings expose whether evidence is sealed, and gate failures name the drift. MCP gets the same write capability.

## Consequences

Teams can make gates resistant to evidence tampering and accidental drift. Existing verified policies keep their meaning, while sealed policies deliberately require commit or hash-bound evidence.
