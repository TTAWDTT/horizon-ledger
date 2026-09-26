---
id: D-0007
title: Detect explicit decision contradictions deterministically
status: decided
createdAt: 2026-09-26T11:05:11.246Z
updatedAt: 2026-09-26T11:05:11.696Z
confidence: medium
horizon: medium
kind: engineering
scope:
  - src/core/conflicts.ts
  - src/cli
  - src/mcp
  - src/web
tags:
  - conflict
  - governance
links: []
alternatives:
  - id: A-001
    name: Semantic LLM contradiction review
    verdict: deferred
    reason: Useful later, but not reliable enough for a deterministic CI gate.
evidence:
  - type: file
    value: src/core/conflicts.ts
    note: Deterministic conflict rules
    strength: strong
    id: E-001
---

## Summary

Conflicts should be detected from structured verdicts and relationships, not by guessing from prose.

## Context

Natural-language contradiction detection is powerful but noisy. Horizon already records structured alternatives, scopes, statuses, and links.

## Decision

Flag accepted versus rejected alternatives with the same name in overlapping scopes, plus dangling or incomplete supersession relationships.

## Consequences

CI and agents get a low-noise consistency gate, while broader semantic drift remains out of scope for the core.

