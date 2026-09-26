---
id: D-0030
title: Publish evidence packages from CI
status: decided
createdAt: 2026-09-26T15:26:42.237Z
updatedAt: 2026-09-26T17:30:50.464Z
confidence: high
horizon: medium
kind: engineering
scope:
  - .github/actions/evidence/action.yml
  - tests/actions.test.ts
  - README.md
  - docs/PACKS.md
  - docs/POLICY.md
  - package.json
  - CHANGELOG.md
  - src/version.ts
tags:
  - ci
  - evidence
  - provenance
  - github-actions
owner: Codex
links:
  - id: D-0023
    type: depends_on
    note: Reuse the repository-source Action installation pattern.
  - id: D-0029
    type: depends_on
    note: Publish the evidence package produced by Horizon.
alternatives:
  - id: A-001
    name: Require users to hand-write export and upload steps
    verdict: rejected
    reason: Every team would duplicate fragile path and digest parsing.
  - id: A-002
    name: Generate only a gate report
    verdict: rejected
    reason: CI would not retain the decision context bound to the verdict.
  - id: A-003
    name: Add a new hosted attestation service
    verdict: rejected
    reason: GitHub artifact storage and provenance systems already exist and are opt-in.
policy:
  mode: block
  requireEvidence: sealed
evidence:
  - id: E-001
    type: file
    value: .github/actions/evidence/action.yml
    strength: strong
    note: Reusable evidence-package Action
    hash: a1ab68959ec34d1c75e759266d4551569267100567e88f995266dba44341fa07
  - id: E-002
    type: file
    value: tests/actions.test.ts
    strength: strong
    note: Action contract tests
    hash: 024d6c622d4a102232f1aeac1735eaf8018a3d08efb4b3d3f0edb0e784f670ad
  - id: E-003
    type: link
    value: https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds
    title: GitHub artifact attestations documentation
    strength: strong
    note: Confirms build provenance is a separate standard that Horizon decision evidence complements.
---

## Summary

Add a reusable Horizon Evidence Package GitHub Action that exports the release or PR evidence package, exposes its canonical id, writes a step summary, and uploads the artifact.

## Context

The evidence package exists locally, but CI users would otherwise have to write custom steps for the export path, artifact upload, and output propagation. GitHub artifact attestations cover build provenance; they do not bind the changed decisions and policy verdict together.

## Decision

Ship `.github/actions/evidence`. It uses the workspace evidence command, uploads the JSON package as an optional artifact, and exposes the path and `evidencePackId`. No network call or signing service is required.

## Consequences

Teams can retain the exact decisions and gate verdict for a PR or release with one Action step. Release workflows can later attach the same artifact to a GitHub release or verify its digest downstream.
