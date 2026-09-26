---
id: D-0036
title: Trace workspace commits across roots
status: decided
createdAt: 2026-09-26T17:07:53.778Z
updatedAt: 2026-09-26T17:07:53.778Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/workspace-trace.ts
  - src/core/workspace.ts
  - src/core/index.ts
  - src/cli/index.ts
  - src/mcp/index.ts
  - tests/workspace-trace.test.ts
  - tests/mcp.test.ts
  - README.md
  - docs/AGENTS.md
  - docs/USAGE.md
  - package.json
  - CHANGELOG.md
  - src/version.ts
tags:
  - workspace
  - traceability
  - commits
  - monorepo
  - mcp
owner: Codex
links:
  - id: D-0012
    type: depends_on
    note: Reuse cross-root workspace aggregation.
  - id: D-0035
    type: depends_on
    note: Reuse deterministic commit attribution.
alternatives:
  - id: A-001
    name: Run horizon trace once per root
    verdict: rejected
    reason: Users would lose one workspace-wide traceability matrix and root provenance.
  - id: A-002
    name: Flatten all roots into one ledger
    verdict: rejected
    reason: Root provenance is required to know which repository or package authorized a change.
  - id: A-003
    name: Add a separate traceability database
    verdict: rejected
    reason: Workspace configs and Git already provide the needed local state.
policy:
  mode: block
  requireEvidence: attributed
evidence:
  - id: E-001
    type: commit
    value: bf24f9ffa0abc5abec004e31b249f73194900a92
    strength: strong
    note: Implementation commit for workspace commit trace, CLI, MCP tool, and root provenance tests
  - id: E-002
    type: link
    value: https://github.com/kgsaran/trackfw
    title: trackfw governance CLI
    strength: moderate
    note: Related ADR-to-requirement-to-roadmap traceability, but not cross-root decision commit attribution
---

## Summary

Add workspace-level commit tracing so a monorepo can attribute commits to decisions while preserving which workspace root owns each decision.

## Context

Single-root `horizon trace` solves one repository. But Horizon's differentiator is cross-root workspaces, and its workspace gate already preserves root provenance. Without workspace trace, a monorepo still needs one command per package and loses the cross-root view.

Related tools found during research are strong at ADR authoring or commit-message context, but do not combine workspace root provenance, deterministic evidence, and policy gates.

## Decision

Add `horizon workspace trace` and the read-only `horizon_workspace_trace` MCP tool. Use the workspace Git root to list commits, map each changed path to each enabled root, and classify commits by attached evidence, message reference, or scope match. Keep unattributed commits explicit.

## Consequences

Monorepo release audits can show which root and decision each commit came from. Cross-repo workspaces remain outside this v1 because their Git roots differ; single-root trace remains the primitive for those cases.
