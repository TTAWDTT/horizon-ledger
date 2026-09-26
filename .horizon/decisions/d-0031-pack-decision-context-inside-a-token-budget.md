---
id: D-0031
title: Pack decision context inside a token budget
status: decided
createdAt: 2026-09-26T15:31:57.913Z
updatedAt: 2026-09-27T01:11:00.000Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/context.ts
  - src/core/workspace.ts
  - src/cli/index.ts
  - src/mcp/index.ts
  - tests/context.test.ts
  - tests/workspace.test.ts
  - docs/USAGE.md
  - docs/AGENTS.md
  - README.md
  - package.json
  - CHANGELOG.md
  - src/version.ts
tags:
  - agents
  - context
  - mcp
  - token-budget
owner: Codex
links:
  - id: D-0010
    type: depends_on
    note: Extend deterministic context bundles.
  - id: D-0013
    type: depends_on
    note: Extend workspace context for multi-root agents.
alternatives:
  - id: A-001
    name: Return every matching decision
    verdict: rejected
    reason: A large corpus can overflow the agent context window.
  - id: A-002
    name: Truncate decision bodies
    verdict: rejected
    reason: Half a policy or consequence is more dangerous than an explicit omission.
  - id: A-003
    name: Add an embedding model
    verdict: rejected
    reason: Horizon should remain deterministic, local-first, and usable without models.
  - id: A-004
    name: Use a full tokenizer dependency
    verdict: deferred
    reason: A deterministic chars-per-token estimate is enough for stable v1 budgets.
policy:
  mode: block
  requireEvidence: verified
evidence:
  - id: E-001
    type: file
    value: src/core/context.ts
    strength: strong
    note: Budget-aware single-root context packing
    hash: 447c5f12cd867037a04e69058beb2adf7bbdf7cd4cb9e43ad6bd4ea5fd96a719
  - id: E-002
    type: commit
    value: bf24f9ffa0abc5abec004e31b249f73194900a92
    strength: strong
    note: Budget-aware multi-root workspace packing sealed as Git history
  - id: E-003
    type: test
    value: tests/context.test.ts
    strength: strong
    note: Budget, omission, and policy ranking coverage
    hash: 2261a0c4732ec1005a5e59598d11145f396b332f7e1f2fe068a4c252d2033434
---

## Summary

Let agents request a decision context pack with an approximate token budget. Horizon keeps whole decisions, ranks blocking and higher-quality decisions first, and reports every omitted decision explicitly.

## Context

Context bundles are useful, but a workspace can return more decisions than fit in an agent session. Generic repository context packers solve this for arbitrary files; Horizon can do better by packing governed decisions only and using evidence, status, and policy as ranking signals.

## Decision

Add `maxTokens` to context and workspace context APIs, CLI commands, and MCP tools. Use a deterministic `ceil(text/4)` estimate, never truncate a decision, and return a structured `packing` result with included and omitted decision ids and reasons.

## Consequences

Agents can request bounded context without losing the audit trail. Omissions are visible instead of silent. Full context remains the default, so no existing behavior changes.


