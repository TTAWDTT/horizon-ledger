---
id: D-0037
title: Bind release provenance into one audit
status: decided
createdAt: 2026-09-26T17:22:25.633Z
updatedAt: 2026-09-26T17:22:25.633Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/release-audit.ts
  - src/core/index.ts
  - src/cli/index.ts
  - src/mcp/index.ts
  - tests/release-audit.test.ts
  - tests/mcp.test.ts
  - README.md
  - docs/PACKS.md
  - docs/AGENTS.md
  - docs/USAGE.md
  - package.json
  - CHANGELOG.md
  - src/version.ts
tags:
  - workspace
  - release
  - provenance
  - policy
  - traceability
  - mcp
owner: Codex
links:
  - id: D-0019
    type: depends_on
    note: Reuse deterministic workspace decision packs.
  - id: D-0027
    type: depends_on
    note: Reuse hash-bound policy gate reports.
  - id: D-0036
    type: depends_on
    note: Reuse workspace commit trace attribution.
alternatives:
  - id: A-001
    name: Archive a pack, report, and trace separately
    verdict: rejected
    reason: Separate files do not guarantee that one release used the same decisions, policy, and commit range.
  - id: A-002
    name: Require a hosted release service
    verdict: rejected
    reason: Release proof should remain inspectable and usable on a local machine without a vendor.
  - id: A-003
    name: Put a Git patch in the audit
    verdict: rejected
    reason: A patch would duplicate immutable Git history and risk carrying secrets or binaries.
policy:
  mode: block
  requireEvidence: attributed
evidence:
  - id: E-001
    type: commit
    value: d9b8312e1d9df332417a330def3f8fb3130fcf74
    strength: strong
    note: Implementation commit for the release audit core, CLI, MCP tools, tests, and documentation
  - id: E-002
    type: link
    value: https://slsa.dev/
    title: SLSA
    strength: moderate
    note: Supply-chain provenance model; Horizon adds decision authorization and workspace commit attribution
  - id: E-003
    type: link
    value: https://in-toto.io/
    title: in-toto
    strength: moderate
    note: Statement subject format used by the local release audit
---

## Summary

Add a self-contained Horizon release audit that binds decisions, policy authorization, and workspace commit traceability into one verifiable artifact.

## Context

Workspace packs record decisions, gate reports record policy verdicts, and workspace traces record commit attribution. Keeping those outputs separate makes release review easy to mis-assemble: an auditor cannot prove that the same range, decisions, and verdict belong together.

Research into SLSA, in-toto, evidence-pack tools, and release governance utilities found good subject formats and supply-chain primitives, but not a deterministic local artifact that also answers *which decision authorized this commit, under which root, and did the policy pass?*

## Decision

Add `horizon workspace release export`, `inspect`, and `verify`. Embed the workspace pack, gate report, and commit trace under canonical SHA-256 digests and an in-toto Statement v1 subject set. Add read-only `horizon_workspace_release_export`, `horizon_workspace_release_inspect`, and `horizon_workspace_release_verify` MCP tools.

## Consequences

A release audit can be archived or handed to another process with one file. Verification checks the envelope, embedded artifact hashes, statement consistency, policy metadata, and trace expectations. External signing remains out of scope locally; the statement is signature-envelope ready for DSSE or Sigstore workflows.
