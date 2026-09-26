---
id: D-0035
title: Trace implementation commits to decisions
status: decided
createdAt: 2026-09-26T16:45:32.449Z
updatedAt: 2026-09-26T16:45:32.449Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/commit.ts
  - src/core/trace.ts
  - src/core/audit.ts
  - src/core/policy.ts
  - src/core/types.ts
  - src/core/validate.ts
  - src/core/sarif.ts
  - src/cli/index.ts
  - src/mcp/index.ts
  - tests/trace.test.ts
  - tests/mcp.test.ts
  - README.md
  - docs/POLICY.md
  - docs/AGENTS.md
  - docs/USAGE.md
  - docs/COMPARISON.md
  - package.json
  - CHANGELOG.md
  - src/version.ts
tags:
  - commits
  - traceability
  - evidence
  - policy
  - mcp
owner: Codex
links:
  - id: D-0009
    type: depends_on
    note: Reuse deterministic evidence auditing.
  - id: D-0021
    type: depends_on
    note: Extend the opt-in evidence gate.
alternatives:
  - id: A-001
    name: Accept any existing commit as sealed evidence
    verdict: rejected
    reason: An arbitrary commit proves existence, not implementation of the decision.
  - id: A-002
    name: Require only a commit-message reference
    verdict: rejected
    reason: A message reference is useful, but scope changes are usually stronger and should also be surfaced.
  - id: A-003
    name: Ask an LLM to infer attribution
    verdict: rejected
    reason: Release audits need deterministic, repeatable trace results.
  - id: A-004
    name: Build a separate traceability system
    verdict: rejected
    reason: The decision ledger already has scope, evidence, policy, and audit primitives.
policy:
  mode: block
  requireEvidence: attributed
evidence:
  - id: E-001
    type: commit
    value: 5762a8e3d711036262d24086e67f7735f237b817
    strength: strong
    note: Implementation commit for commit tracing, attributed evidence, gate enforcement, and MCP exposure
  - id: E-002
    type: link
    value: https://git-scm.com/docs/git-log
    title: Git log documentation
    strength: moderate
    note: Deterministic local commit history is already available without a cloud service
---

## Summary

Add commit tracing and an `attributed` evidence requirement so implementation commits can be linked back to decisions by scope, message reference, or attached evidence.

## Context

Existing ADR tools are strong at writing decisions but weak at proving which implementation changes came from them. Horizon previously verified that a commit exists and therefore treated any commit as sealed evidence. That is too weak for a release audit.

A comparison of popular ADR tools and traceability tooling found static authoring and publication workflows, not deterministic decision-to-commit attribution. Git already contains the needed history; the missing piece is a local, policy-aware trace.

## Decision

Add a `horizon trace` command and `horizon_trace` MCP tool. Classify commits as evidence, message references, or scope matches, and expose unattributed commits explicitly. Add `requireEvidence: attributed` to accept a verified commit only when it touches the decision scope or names the decision id. Do not fetch remotes, trust inference, or replace human review.

## Consequences

Release audits can distinguish real implementation evidence from arbitrary commit hashes. Users get a traceability matrix without a separate compliance database. Commits that intentionally implement multiple decisions remain visible, and unrelated commits remain explicit rather than silently disappearing.

