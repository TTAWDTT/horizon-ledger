---
id: D-0028
title: Verify gate reports through MCP
status: decided
createdAt: 2026-09-26T15:03:17.037Z
updatedAt: 2026-09-26T15:03:17.315Z
confidence: high
horizon: short
kind: engineering
scope:
  - src/core/report.ts
  - src/mcp/index.ts
  - tests/mcp.test.ts
  - docs/POLICY.md
  - docs/AGENTS.md
  - package.json
  - CHANGELOG.md
  - src/version.ts
tags:
  - mcp
  - agents
  - policy
  - audit
owner: Codex
links:
  - id: D-0027
    type: depends_on
    note: Verification wraps the hash-bound report format.
alternatives:
  - id: A-001
    name: Trust report JSON without verification
    verdict: rejected
    reason: Agents would accept edited artifacts.
  - id: A-002
    name: Have agents call the CLI directly
    verdict: rejected
    reason: MCP hosts may have no shell access.
  - id: A-003
    name: Return only pass or fail
    verdict: rejected
    reason: Agents need report and gate digests for audit trails.
policy:
  mode: block
  requireEvidence: verified
evidence:
  - id: E-001
    type: file
    value: src/core/report.ts
    note: Verification core and expectations
    strength: strong
  - id: E-002
    type: file
    value: src/mcp/index.ts
    note: Read-only MCP verification tool
    strength: strong
  - id: E-003
    type: test
    value: tests/mcp.test.ts
    note: MCP report verification and mismatch test
    strength: strong
---

## Summary

Agents can validate a raw hash-bound gate report before trusting or acting on it.

## Context

Gate reports already provide SHA-256 tamper evidence, but agents currently need to shell out to the CLI. MCP hosts need the same verification primitive so they can validate an artifact and reject the wrong digest or verdict.

## Decision

Add the read-only `horizon_verify_gate_report` tool. It parses and verifies raw report JSON and supports optional `expectReportId`, `expectGateDigest`, and `expectVerdict` guards.

## Consequences

Agents can bind their decision to an exact report digest and verdict without shell access. Invalid or mismatched reports return MCP errors instead of being silently accepted.
