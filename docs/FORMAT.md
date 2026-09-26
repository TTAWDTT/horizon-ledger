# Horizon Ledger decision format

Horizon Ledger keeps each decision in a Markdown file with YAML front matter.

```md
---
id: D-0001
title: Use SQLite for local storage
status: decided
createdAt: 2026-09-26T00:00:00.000Z
updatedAt: 2026-09-26T00:00:00.000Z
confidence: high
horizon: long
kind: engineering
scope:
  - core
tags:
  - storage
owner: Codex
links:
  - id: D-0002
    type: supersedes
alternatives:
  - id: A
    name: SQLite
    verdict: accepted
  - id: B
    name: Postgres
    verdict: rejected
    reason: More operational overhead for a local-first tool.
evidence:
  - id: E-001
    type: link
    value: https://sqlite.org
    title: SQLite docs
    strength: strong
---

## Summary

SQLite is simple, portable, and good enough for local-first data.

## Context

Horizon Ledger should be easy to install and easy to use offline.

## Decision

Use SQLite as the default local storage engine.

## Consequences

Simple local setup. Some tradeoffs for concurrent writes and complex queries.
```

Horizon Ledger intentionally uses Markdown for human readability and YAML for machine readability.

