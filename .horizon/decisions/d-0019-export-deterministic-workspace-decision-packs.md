---
id: D-0019
title: Export deterministic workspace decision packs
status: decided
createdAt: 2026-09-26T13:27:00.086Z
updatedAt: 2026-09-26T13:27:00.086Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/pack.ts
  - src/cli/index.ts
  - src/mcp/index.ts
tags: []
owner: Codex
links:
  - id: D-0016
    type: depends_on
    note: Packs extend workspace exports with a verifiable handoff envelope.
alternatives:
  - id: A-001
    name: Markdown-only sync
    verdict: rejected
    reason: Prose reports are useful, but not machine-verifiable or idempotent enough for handoff.
  - id: A-002
    name: Zip archive
    verdict: deferred
    reason: Archives add nondeterminism, path complexity, and packaging risk before the format is proven.
  - id: A-003
    name: Include live working-tree files
    verdict: rejected
    reason: It would export secrets and working state that were never reviewed as decision evidence.
evidence:
  - type: file
    value: src/core/pack.ts
    note: Canonical pack schema, SHA-256 pack id, and markdown hashes
    strength: strong
    id: E-001
  - type: file
    value: src/cli/index.ts
    note: Pack export and read-only inspect commands
    strength: strong
    id: E-002
  - type: file
    value: src/mcp/index.ts
    note: Read-only pack export MCP tool
    strength: strong
    id: E-003
  - type: file
    value: tests/workspace-pack.test.ts
    note: Determinism, integrity, and tamper detection tests
    strength: strong
    id: E-004
---

## Summary

A workspace can now export a deterministic JSON decision pack that binds the pack and each decision Markdown to SHA-256 hashes.

## Context

Teams need a portable handoff without a hosted service, while agents and auditors need to know that the handoff was not silently changed. The existing workspace export was readable but did not provide a stable integrity envelope.

## Decision

Use a versioned JSON pack with root provenance, raw decision Markdown, canonical payload hashing, audit summaries, diagnostics, conflicts, and a read-only inspect path. Do not copy the working tree or package binaries in this first format.

## Consequences

Decision context becomes easy to archive, review, and pass between machines. A later import can be made strict and idempotent without inventing a cloud dependency.
