---
id: D-0011
title: Surface decisions on pull requests
status: decided
createdAt: 2026-09-26T11:38:24.906Z
updatedAt: 2026-09-26T11:38:25.349Z
confidence: medium
horizon: medium
kind: process
scope:
  - src/core/pr-context.ts
  - .github/actions/pr-context
tags:
  - pr
  - review
links: []
alternatives:
  - id: A-001
    name: Rely on reviewers to remember ADRs
    verdict: rejected
    reason: Context is not discoverable at the moment of approval.
evidence:
  - type: file
    value: src/core/pr-context.ts
    note: Aggregates decisions from changed files
    strength: strong
    id: E-001
---

## Summary

Reviewers should see the decisions affected by a change before approving it.

## Context

Reviewers rarely have time to search ADRs; PR descriptions and Slack threads lose the durable context.

## Decision

Build deterministic PR context from changed files and optionally post it as a pull request comment.

## Consequences

Reviewers get scope-aware context automatically, without relying on an LLM or hosted service.

