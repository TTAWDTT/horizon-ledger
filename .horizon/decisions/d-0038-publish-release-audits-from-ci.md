---
id: D-0038
title: Publish release audits from CI
status: decided
createdAt: 2026-09-26T17:30:38.619Z
updatedAt: 2026-09-26T17:30:38.619Z
confidence: high
horizon: medium
kind: engineering
scope:
  - .github/actions/release-audit/action.yml
  - tests/actions.test.ts
  - README.md
  - docs/PACKS.md
  - docs/USAGE.md
  - docs/BUSINESS.md
  - package.json
  - CHANGELOG.md
  - src/version.ts
tags:
  - release
  - provenance
  - ci
  - github-actions
  - traceability
owner: Codex
links:
  - id: D-0037
    type: depends_on
    note: Publish the release audit primitive through the existing CI contract.
  - id: D-0030
    type: depends_on
    note: Reuse the evidence-package artifact upload pattern.
alternatives:
  - id: A-001
    name: Use a custom release workflow per repository
    verdict: rejected
    reason: Each repository would re-implement artifact naming, outputs, summaries, and retention.
  - id: A-002
    name: Upload decisions, reports, and traces separately
    verdict: rejected
    reason: CI would lose the single hash-bound binding between the release and its proof.
  - id: A-003
    name: Require signing before CI export
    verdict: rejected
    reason: Artifact retention and signature-envelope readiness should not depend on a key management provider.
policy:
  mode: block
  requireEvidence: attributed
evidence:
  - id: E-001
    type: commit
    value: 1f19eeb5b364b1dbdd8ee17aa1d720fa4c054fae
    strength: strong
    note: Implementation commit for the release-audit Action, action tests, docs, and version bump
  - id: E-002
    type: link
    value: https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts
    title: GitHub Actions artifacts
    strength: moderate
    note: CI retention and artifact output model
  - id: E-003
    type: link
    value: https://in-toto.io/
    title: in-toto
    strength: moderate
    note: Attestation subject format retained by the release audit
---

## Summary

Publish Horizon release audits from CI as reusable workflow artifacts with deterministic ids, gate verdicts, and trace counts.

## Context

The v0.28 release audit can be exported locally, but release automation still required a hand-written workflow. A reusable Action makes the audit useful on pull requests, release branches, and nightly provenance snapshots.

SLSA and in-toto are strong provenance primitives; GitHub artifacts are the natural retention boundary for local deterministic audits.

## Decision

Add `.github/actions/release-audit`. The Action exports the release audit, writes a human-readable step summary, exposes audit, pack, gate, verdict, and trace-count outputs, and uploads the JSON artifact with a one-year default retention.

## Consequences

Teams can retain one audit file for a release without adopting a hosted service. Workflows can downstream-verify the audit or forward its Statement to an attestation store without Horizon owning the key or archive.
