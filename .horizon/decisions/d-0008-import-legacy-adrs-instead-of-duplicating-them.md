---
id: D-0008
title: Import legacy ADRs instead of duplicating them
status: decided
createdAt: 2026-09-26T11:10:03.969Z
updatedAt: 2026-09-26T11:10:04.398Z
confidence: medium
horizon: medium
kind: engineering
scope:
  - src/core/import-adr.ts
  - src/cli
tags:
  - import
  - migration
links: []
alternatives:
  - id: A-001
    name: Copy all legacy ADRs into Horizon files
    verdict: rejected
    reason: It would fork history and make future provenance harder to audit.
evidence:
  - type: file
    value: src/core/import-adr.ts
    note: Safe importer and deduplication
    strength: strong
    id: E-001
---

## Summary

Existing ADR content should become searchable Horizon evidence without moving or rewriting files.

## Context

Most teams already have Nygard or MADR Markdown ADRs, and a new ledger is hard to adopt if it discards history.

## Decision

Import titles, status, context, decision, consequences, considered options, and links, then preserve the original file as strong evidence.

## Consequences

Existing teams can migrate incrementally, while imported records remain honest about missing structured evidence.

