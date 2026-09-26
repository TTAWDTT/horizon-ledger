---
id: D-0002
title: Keep decisions in Markdown with YAML front matter
status: decided
createdAt: 2026-09-26T09:41:29.752Z
updatedAt: 2026-09-26T09:42:00.098Z
confidence: medium
horizon: medium
kind: engineering
scope:
  - src/core
tags:
  - format
links:
  - id: D-0001
    type: supersedes
alternatives: []
evidence:
  - type: link
    value: docs/FORMAT.md
    note: Format documentation
    strength: strong
    id: E-001
---

## Summary

Markdown stays readable, YAML stays machine-readable.

## Context

Horizon Ledger must be easy to read, diff, and parse.

## Decision

Use Markdown files with YAML front matter.

## Consequences

Human-friendly files and simple integration.
