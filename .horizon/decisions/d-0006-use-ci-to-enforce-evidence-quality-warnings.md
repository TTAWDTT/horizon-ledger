---
id: D-0006
title: Use CI to enforce evidence-quality warnings
status: decided
createdAt: 2026-09-26T11:00:18.940Z
updatedAt: 2026-09-26T11:00:19.407Z
confidence: medium
horizon: medium
kind: process
scope:
  - .github/actions/validate
tags:
  - ci
  - governance
links: []
alternatives:
  - id: A-001
    name: Manual review only
    verdict: rejected
    reason: Missing alternatives and evidence would continue to merge unnoticed.
evidence:
  - type: file
    value: .github/actions/validate/action.yml
    note: Composite validation Action
    strength: strong
    id: E-001
---

## Summary

Decision quality should be checked in pull requests, not only manually.

## Context

Decision records decay when incomplete context, alternatives, or evidence are added after review.

## Decision

Provide a self-contained GitHub Action that runs Horizon validation, and fail the repository's own CI on any warning or error.

## Consequences

PRs get a deterministic quality gate without a hosted service, while teams can run less strict validation if needed.

