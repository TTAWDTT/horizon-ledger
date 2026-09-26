---
id: D-0021
title: Add an opt-in evidence-aware change gate
status: decided
createdAt: 2026-09-26T14:00:36.415Z
updatedAt: 2026-09-26T14:21:12.983Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/policy.ts
  - src/core/types.ts
  - src/core/ledger.ts
  - src/core/validate.ts
  - src/cli/index.ts
  - src/mcp/index.ts
  - docs/POLICY.md
  - tests/policy.test.ts
tags: []
owner: Codex
links:
  - id: D-0011
    type: depends_on
    note: Gate reuses pull-request path relevance.
  - id: D-0009
    type: depends_on
    note: Gate can require verified evidence before allowing a change.
alternatives:
  - id: A-001
    name: Make every ADR blocking by default
    verdict: rejected
    reason: Existing ledgers would break and unrelated prose changes would fail CI.
  - id: A-002
    name: Ask an LLM whether the change follows the decision
    verdict: rejected
    reason: Gate behavior must be deterministic and reproducible.
  - id: A-003
    name: Duplicate ADR Kit's hook installation
    verdict: rejected
    reason: Horizon should provide a portable decision/evidence gate without taking over client hook slots.
policy:
  mode: block
  requireEvidence: verified
evidence:
  - type: file
    value: src/core/policy.ts
    note: Gate evaluation and policy modes
    strength: strong
    id: E-001
  - type: file
    value: src/core/types.ts
    note: Decision policy schema
    strength: strong
    id: E-002
  - type: file
    value: src/core/ledger.ts
    note: Policy persistence in Markdown/YAML front matter
    strength: strong
    id: E-003
  - type: file
    value: tests/policy.test.ts
    note: Pass, warn, block, and strong-evidence tests
    strength: strong
    id: E-004
  - type: doc
    value: docs/POLICY.md
    note: Policy modes and evidence requirements
    strength: strong
    id: E-005
  - type: file
    value: src/core/validate.ts
    note: Validates policy mode and evidence metadata
    strength: strong
    id: E-006
  - type: test
    value: tests/policy.test.ts
    note: Pass, warn, block, evidence, and validation tests
    strength: strong
    id: E-007
---

## Summary

Horizon now has an opt-in change gate that checks changed files against decision policies and verified evidence.

## Context

Decision context is useful, but some decisions must constrain execution. Existing ADR guardrails are useful; Horizon can add value by reusing its evidence audit, scope graph, and deterministic decision shape instead of installing client-specific hooks.

## Decision

Add a `policy` field with `observe`, `review`, and `block` modes plus evidence requirements. Expose `horizon gate` and the read-only `horizon_gate` MCP tool. Gate only decisions that explicitly opt in.

## Consequences

Teams can require verified evidence before a governed path changes. Non-policy decisions keep working as context, and no existing ledger becomes stricter by accident.
