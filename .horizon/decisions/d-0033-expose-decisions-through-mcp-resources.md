---
id: D-0033
title: Expose decisions through MCP resources
status: decided
createdAt: 2026-09-26T15:44:52.010Z
updatedAt: 2026-09-26T15:42:35.188Z
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
  - agents
  - resources
owner: Codex
links:
  - id: D-0003
    type: depends_on
    note: Extend the existing MCP surface.
  - id: D-0012
    type: depends_on
    note: Expose workspace packs as resources too.
alternatives:
  - id: A-001
    name: Keep tool calls only
    verdict: rejected
    reason: Hosts that can attach resources need to reimplement enumeration and lookup.
  - id: A-002
    name: Embed all decisions in one resource
    verdict: rejected
    reason: One file cannot support per-decision lookup or efficient host selection.
  - id: A-003
    name: Serve raw filesystem URIs
    verdict: rejected
    reason: Raw paths bypass decision formatting, validation, and workspace provenance.
policy:
  mode: block
  requireEvidence: sealed
evidence:
  - id: E-001
    type: file
    value: src/mcp/index.ts
    strength: strong
    note: MCP resource and resource template registration
    hash: de6d1e46f611f75d2f4dac6cd5d6d8a4e4ef6df5f3a0d1e2704586381ba116cc
  - id: E-002
    type: test
    value: tests/mcp.test.ts
    strength: strong
    note: MCP resource list and read coverage
    hash: ab8be1274d4fb6ecfc02a94a580a6879dfd866fe8696e642f3de54b20860e40e
  - id: E-003
    type: link
    value: https://modelcontextprotocol.io/specification/2025-06-18/server/resources.md
    title: MCP resources specification
    strength: strong
    note: Uses the standard resources/list and resources/read protocol
---

## Summary

Expose Horizon decisions and workspace packs as MCP resources, so MCP-compatible hosts can discover and attach governed context without custom tool calls.

## Context

MCP resources are application-driven context. Tools are good for actions and queries, but hosts also need a browsable list of individual decisions and a workspace pack.

## Decision

Register `horizon://decisions`, `horizon://decisions/{id}`, and `horizon://workspace/pack` resources. Keep them read-only and return the same JSON used by tools.

## Consequences

Hosts can show Horizon resources in their native picker and attach exact decision context without extra glue.
