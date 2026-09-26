---
id: D-0029
title: Ship a portable decision evidence package
status: decided
createdAt: 2026-09-26T15:09:29.718Z
updatedAt: 2026-09-26T15:18:09.860Z
confidence: high
horizon: long
kind: engineering
scope:
  - src/core/hash.ts
  - src/core/evidence.ts
  - src/core/index.ts
  - src/cli/index.ts
  - src/mcp/index.ts
  - tests/evidence-pack.test.ts
  - tests/mcp.test.ts
  - docs/PACKS.md
  - docs/POLICY.md
  - docs/AGENTS.md
  - README.md
  - package.json
  - CHANGELOG.md
  - src/version.ts
tags:
  - evidence
  - provenance
  - audit
  - agents
owner: Codex
links:
  - id: D-0019
    type: depends_on
    note: The package embeds a hash-bound workspace pack.
  - id: D-0027
    type: depends_on
    note: The package embeds a hash-bound policy gate report.
alternatives:
  - id: A-001
    name: Ship decision and gate artifacts separately
    verdict: rejected
    reason: A consumer would still have to invent a binding between them.
  - id: A-002
    name: Build a hosted evidence store
    verdict: rejected
    reason: It duplicates supply-chain stores and breaks the local-first contract.
  - id: A-003
    name: Require signatures in v1
    verdict: rejected
    reason: Key management is environment-specific; signatures can wrap the exported in-toto statement externally.
  - id: A-004
    name: Use a custom opaque archive
    verdict: rejected
    reason: Reviewers and policy engines need an inspectable, digest-compatible JSON artifact.
policy:
  mode: block
  requireEvidence: sealed
evidence:
  - id: E-001
    type: link
    value: https://raw.githubusercontent.com/in-toto/attestation/main/spec/v1/statement.md
    title: in-toto Statement layer specification
    strength: strong
    note: Provides the interoperable subject and predicate envelope.
  - id: E-002
    type: file
    value: src/core/evidence.ts
    strength: strong
    note: Evidence package producer and verifier
    hash: d319dc33f2638b5265c2c3d378c9947a7bcffd917d85dd7a1feee3df800b60f9
  - id: E-003
    type: file
    value: src/core/hash.ts
    strength: strong
    note: Shared canonical SHA-256 primitives
    hash: 8be9462b2ab54a16dcafb93f073a1af02228b4082c0ba35eac3fc896db439bb3
---

## Summary

A Horizon evidence package is a self-verifying JSON artifact that carries both the workspace decision pack and the exact hash-bound policy gate report, plus an in-toto Statement for portable attestation interop.

## Context

Workspace packs move decisions, while gate reports prove that the current policy evaluation passed. Consumers that need to retain a release or audit trail must currently carry and manually bind two artifacts. Existing evidence stores solve central storage and signing, but not the local-first decision-to-gate package.

## Decision

Add `horizon.evidence-pack` schema version 1. It embeds the workspace pack and gate report as named artifacts, binds each artifact to a SHA-256 digest, includes an in-toto Statement with a Horizon decision-evidence predicate, and binds the whole payload to `evidencePackId`. Add export, inspect, and verify commands plus read-only MCP tools.

## Consequences

A single file is enough to archive, audit, or hand off both the decision context and the gate result. Verification checks the package, embedded pack, embedded gate report, and statement subjects. Signature envelopes remain out of scope for v1, so users can sign or store the statement without Horizon adding key-management risk.
