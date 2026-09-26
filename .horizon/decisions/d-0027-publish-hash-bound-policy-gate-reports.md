---
id: D-0027
title: Publish hash-bound policy gate reports
status: decided
createdAt: 2026-09-26T14:59:21.746Z
updatedAt: 2026-09-26T14:59:29.435Z
confidence: high
horizon: short
kind: engineering
scope:
  - .github/actions/gate/action.yml
  - src/core/report.ts
  - src/core/index.ts
  - src/cli/index.ts
  - tests/report.test.ts
  - tests/actions.test.ts
  - docs/POLICY.md
  - docs/USAGE.md
  - README.md
  - package.json
  - CHANGELOG.md
  - src/version.ts
tags: []
owner: Codex
links:
  - id: D-0021
    type: depends_on
    note: Reports wrap the deterministic gate result.
alternatives:
  - id: A-001
    name: Upload only Markdown output
    verdict: rejected
    reason: Markdown is readable but not tamper-evident.
  - id: A-002
    name: Use a hosted report service
    verdict: rejected
    reason: Horizon should stay local-first and avoid vendor lock-in.
  - id: A-003
    name: Emit SLSA provenance now
    verdict: deferred
    reason: Digest-bound reports are useful first, while a full provenance format needs a separate contract.
policy:
  mode: block
  requireEvidence: verified
evidence:
  - id: E-001
    type: file
    value: src/core/report.ts
    note: Hash-bound report schema and parser
    strength: strong
  - id: E-002
    type: file
    value: src/cli/index.ts
    note: Report writing and verification commands
    strength: strong
  - id: E-003
    type: file
    value: .github/actions/gate/action.yml
    note: Action report and artifact upload
    strength: strong
  - id: E-004
    type: test
    value: tests/report.test.ts
    note: Report round-trip and tamper tests
    strength: strong
---

## Summary

Gate output becomes a verifiable artifact with a canonical SHA-256 report id and gate digest.

## Context

A CI gate is useful for the immediate run, but auditors and agents need an immutable-looking artifact that can be re-verified later and referenced by digest.

## Decision

Add a versioned JSON gate report with `gateDigest` and `reportId`. Add `--report` to gate commands, a `horizon report` verifier, and optional Action artifact upload.

## Consequences

Every governed run can leave a portable, hash-bound artifact. Existing gate output and exit behavior stay unchanged unless users opt into reports or artifacts.
