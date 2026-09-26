---
id: D-0010
title: Serve decisions as deterministic agent context bundles
status: decided
createdAt: 2026-09-26T11:25:35.930Z
updatedAt: 2026-09-26T11:25:36.398Z
confidence: medium
horizon: medium
kind: engineering
scope:
  - src/core/context.ts
  - src/cli
  - src/mcp
tags:
  - agents
  - context
links: []
alternatives:
  - id: A-001
    name: Let the agent search the whole repository
    verdict: rejected
    reason: It increases tokens, misses evidence-aware filtering, and produces inconsistent context.
evidence:
  - type: file
    value: src/core/context.ts
    note: Deterministic context bundle builder
    strength: strong
    id: E-001
---

## Summary

Agents should receive scope, decision, alternatives, evidence, conflicts, and audit in one compact bundle.

## Context

Agents often get either full files or opaque summaries. They need the same evidence-aware decision context humans use.

## Decision

Add horizon context and horizon_context to build deterministic JSON or Markdown bundles by file path or text query.

## Consequences

Agents get stable, local, reviewable context without reading unrelated repository content.

