---
id: D-0034
title: Add governed MCP prompt templates
status: decided
createdAt: 2026-09-26T15:55:31.703Z
updatedAt: 2026-09-26T15:58:25.953Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/mcp/index.ts
  - tests/mcp.test.ts
  - docs/AGENTS.md
  - package.json
  - CHANGELOG.md
  - src/version.ts
tags:
  - mcp
  - prompts
  - agents
  - governance
owner: Codex
links:
  - id: D-0003
    type: depends_on
    note: Extend the existing MCP surface.
  - id: D-0010
    type: depends_on
    note: Use deterministic context in prompt workflow.
  - id: D-0027
    type: depends_on
    note: Reference hash-bound gate reports in the audit prompt.
alternatives:
  - id: A-001
    name: Leave prompt design to each host
    verdict: rejected
    reason: Users would lose a repeatable governance workflow across tools.
  - id: A-002
    name: Embed decision data directly in prompts
    verdict: rejected
    reason: Stale prompt copies would bypass evidence and policy checks.
  - id: A-003
    name: Build a separate prompt framework
    verdict: rejected
    reason: The MCP prompts surface is the standard extension point.
policy:
  mode: block
  requireEvidence: sealed
evidence:
  - id: E-001
    type: file
    value: src/mcp/index.ts
    strength: strong
    note: Governed Horizon prompt registrations
    hash: 15fb25fc4dd46b56f41360c6966ae4d83964342e9210ed3e1bda2725da46d14d
  - id: E-002
    type: test
    value: tests/mcp.test.ts
    strength: strong
    note: Prompt discovery and retrieval coverage
    hash: 9e99ff4389cdad07e84e02372373cf0249287b6fe9de17367464c942e1fe477c
  - id: E-003
    type: link
    value: https://modelcontextprotocol.io/specification/2025-06-18/server/prompts.md
    title: MCP prompts specification
    strength: strong
    note: Standard user-controlled prompt interface
---

## Summary

Expose three MCP prompt templates for governed change review, decision capture, and release auditing so users can invoke the same Horizon workflow from MCP hosts.

## Context

Horizon already has tools and resources, but agents still need a repeatable prompt for how to consult and update decisions. Existing prompt-template servers are generic; they do not know Horizon evidence and policy semantics.

## Decision

Register `horizon_change_review`, `horizon_decision_capture`, and `horizon_release_audit` MCP prompts. Keep prompts as instructions to call Horizon tools and resources; do not embed mutable decision content in the prompt itself.

## Consequences

Users get repeatable workflows, and prompt text stays small and stable because it points at live Horizon data rather than copying it.
