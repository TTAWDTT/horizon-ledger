---
id: D-0040
title: Retain compliance reports in CI
status: decided
createdAt: 2026-09-26T17:52:27.754Z
updatedAt: 2026-09-26T17:52:27.754Z
confidence: high
horizon: medium
kind: engineering
scope:
  - .github/actions/compliance/action.yml
  - tests/actions.test.ts
  - README.md
  - docs/COMPLIANCE.md
  - docs/USAGE.md
  - package.json
  - CHANGELOG.md
  - src/version.ts
tags:
  - compliance
  - ci
  - github-actions
  - audit
  - enterprise
owner: Codex
links:
  - id: D-0039
    type: depends_on
    note: Publish the compliance engine through the CI artifact contract.
  - id: D-0030
    type: depends_on
    note: Reuse Horizon workflow artifact and output conventions.
alternatives:
  - id: A-001
    name: Run the CLI in every repository's custom workflow
    verdict: rejected
    reason: Teams would duplicate profile paths, summaries, output wiring, and failed-report retention.
  - id: A-002
    name: Upload only passing reports
    verdict: rejected
    reason: A failed control report is often the most important audit artifact.
  - id: A-003
    name: Post an automatic compliance status
    verdict: rejected
    reason: v1 should avoid noisy PR comments until teams choose the review workflow.
policy:
  mode: block
  requireEvidence: attributed
evidence:
  - id: E-001
    type: commit
    value: 734680ea2f19cbe42e8d5ac5c91f8182e6ce8b11
    strength: strong
    note: Implementation commit for the compliance Action, tests, CI docs, and version bump
  - id: E-002
    type: link
    value: https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts
    title: GitHub Actions artifacts
    strength: moderate
    note: Retention model for failed and passing compliance snapshots
---

## Summary

Add a reusable Horizon Compliance Report Action that evaluates a profile, uploads the hash-bound report, and exposes deterministic control-count outputs.

## Context

The local compliance engine can already exit non-zero, but enterprise workflows need a standard artifact boundary. Retaining a failing snapshot is especially important because it is evidence for follow-up and human review.

## Decision

Add `.github/actions/compliance`. It exports the report, writes a step summary, exposes report/pack/profile/control outputs, uploads the JSON artifact with a one-year default retention, and preserves a non-zero exit code when any control fails.

## Consequences

Compliance failures remain visible and auditable in CI. The Action does not introduce signing or hosted storage; teams can attach their own DSSE/Sigstore workflow to the retained Statement.
