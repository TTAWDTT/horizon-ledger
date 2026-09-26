---
id: D-0004
title: Keep the dashboard local and dependency-free
status: decided
createdAt: 2026-09-26T10:45:49.351Z
updatedAt: 2026-09-26T10:46:11.923Z
confidence: medium
horizon: medium
kind: engineering
scope:
  - src/web
tags:
  - dashboard
  - local-first
links: []
alternatives:
  - id: A-001
    name: Remote-hosted dashboard
    verdict: rejected
    reason: Private decision context would leave the local repository.
evidence:
  - type: file
    value: src/web/server.ts
    note: Serves HTML and JSON only from 127.0.0.1
    strength: strong
    id: E-001
---

## Summary

The human dashboard reads the ledger directly with no remote assets.

## Context

Decision context may include private engineering reasoning, so the local viewer must not send data to a third-party service or load remote scripts.

## Decision

Serve all HTML, CSS, JavaScript, scores, diagnostics, and graph data from the local Horizon server.

## Consequences

The dashboard works offline and leaks no decision content, while richer custom visualization stays out of the core CLI.

