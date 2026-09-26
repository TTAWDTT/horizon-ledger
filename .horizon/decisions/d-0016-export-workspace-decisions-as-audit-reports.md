---
id: D-0016
title: Export workspace decisions as audit reports
status: decided
createdAt: 2026-09-26T12:30:17.953Z
updatedAt: 2026-09-26T12:30:19.148Z
confidence: high
horizon: medium
kind: engineering
scope: []
tags: []
owner: Codex
links: []
alternatives:
  - id: A-001
    name: Copy decisions into a compliance database
    verdict: rejected
    reason: A hosted copy would weaken local-first ownership before compliance demand is proven.
  - id: A-002
    name: Export only titles and statuses
    verdict: rejected
    reason: An audit report without alternatives, consequences, evidence, and provenance is not reviewable.
evidence:
  - type: file
    value: src/core/workspace.ts
    note: Workspace export implementation
    strength: strong
    id: E-001
  - type: file
    value: tests/workspace.test.ts
    note: Workspace export tests
    strength: strong
    id: E-002
---

## Summary

Workspace export combines decisions, provenance, conflicts, diagnostics, and audit findings into a portable report.

## Context

Teams need a single review artifact for onboarding, due diligence, and compliance without copying ledgers into a hosted tool.

## Decision

Provide deterministic JSON and Markdown exports that preserve root provenance and include deterministic evidence audit results.

## Consequences

Users can review or archive a workspace without granting a remote service access to the ledger.
