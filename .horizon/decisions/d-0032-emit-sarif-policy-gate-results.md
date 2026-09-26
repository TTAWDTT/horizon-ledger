---
id: D-0032
title: Emit SARIF policy gate reports
status: decided
createdAt: 2026-09-26T15:39:18.764Z
updatedAt: 2026-09-26T15:39:42.431Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/policy.ts
  - src/core/workspace.ts
  - src/core/sarif.ts
  - src/core/index.ts
  - src/cli/index.ts
  - tests/policy.test.ts
  - tests/workspace.test.ts
  - docs/POLICY.md
  - README.md
  - package.json
  - CHANGELOG.md
  - src/version.ts
tags:
  - sarif
  - ci
  - policy
  - gate
owner: Codex
links:
  - id: D-0021
    type: depends_on
    note: Convert existing structured gate violations.
  - id: D-0022
    type: depends_on
    note: Convert workspace violations with root provenance.
alternatives:
  - id: A-001
    name: Keep Horizon JSON only
    verdict: rejected
    reason: GitHub and security tooling cannot consume the verdict without custom parsing.
  - id: A-002
    name: Replace Horizon JSON with SARIF
    verdict: rejected
    reason: Horizon evidence and decision context need their own deterministic format.
  - id: A-003
    name: Use a custom Markdown-only report
    verdict: rejected
    reason: Existing security dashboards already understand SARIF.
  - id: A-004
    name: Convert only errors and omit warnings
    verdict: rejected
    reason: Advisory warnings are part of governance.
policy:
  mode: block
  requireEvidence: sealed
evidence:
  - id: E-001
    type: file
    value: src/core/sarif.ts
    strength: strong
    note: SARIF producer with stable rule ids and fingerprints
    hash: b415067bce9bac6060b9b7352e91167a6ba266e18fcf09a98aa59683d6b25955
  - id: E-002
    type: test
    value: tests/sarif.test.ts
    strength: strong
    note: Single-root and workspace SARIF coverage
    hash: ec6b74c551064f9b6c9fdd26c441251dec5669494b0721fc8ff4f391ec19888f
  - id: E-003
    type: link
    value: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
    title: SARIF 2.1.0 specification
    strength: strong
    note: Reusable standard for security dashboard ingestion
---

## Summary

Add a deterministic SARIF 2.1.0 view of Horizon policy gates so existing security dashboards and GitHub code scanning can consume decision violations without losing Horizon rule identity.

## Context

Horizon already emits structured JSON and Markdown, but many security dashboards ingest SARIF. A separate SARIF output is useful; replacing the Horizon report would lose decision evidence and hashing.

## Decision

Add stable Horizon rule ids to gate violations and a SARIF converter for single-root and workspace gates. Results include error/warning levels, stable fingerprints, and artifact locations when available. CLI `gate` and `workspace gate` gain `--format sarif`.

## Consequences

Teams can route Horizon findings into existing SARIF tooling while continuing to use the hash-bound Horizon report for evidence and verification.

