---
id: D-0009
title: Audit evidence before trusting a decision
status: decided
createdAt: 2026-09-26T11:21:24.213Z
updatedAt: 2026-09-26T11:21:24.668Z
confidence: medium
horizon: medium
kind: engineering
scope:
  - src/core/audit.ts
  - src/cli
  - src/mcp
tags:
  - audit
  - provenance
links: []
alternatives:
  - id: A-001
    name: Fetch every external URL on each audit
    verdict: rejected
    reason: It would leak private decision context and make offline CI fragile.
evidence:
  - type: file
    value: src/core/audit.ts
    note: Deterministic evidence verification
    strength: strong
    id: E-001
---

## Summary

A decision ledger is trustworthy only when its evidence can be checked.

## Context

Decision records often cite files, commits, or hashes that later disappear without anyone noticing.

## Decision

Provide deterministic evidence audit for local paths, Git commits, external URLs, and optional sha256-sealed files.

## Consequences

Teams can catch missing proof in CI, while network access remains opt-in and out of the core audit.

