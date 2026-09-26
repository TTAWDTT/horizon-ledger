---
id: D-0039
title: Evaluate local compliance profiles
status: decided
createdAt: 2026-09-26T17:45:33.514Z
updatedAt: 2026-09-26T17:45:33.514Z
confidence: high
horizon: medium
kind: engineering
scope:
  - src/core/compliance.ts
  - src/core/index.ts
  - src/cli/index.ts
  - src/mcp/index.ts
  - tests/compliance.test.ts
  - tests/mcp.test.ts
  - docs/COMPLIANCE.md
  - README.md
  - docs/AGENTS.md
  - docs/USAGE.md
  - docs/BUSINESS.md
  - package.json
  - CHANGELOG.md
  - src/version.ts
tags:
  - compliance
  - policy
  - evidence
  - audit
  - mcp
  - enterprise
owner: Codex
links:
  - id: D-0012
    type: depends_on
    note: Evaluate controls across workspace roots.
  - id: D-0026
    type: depends_on
    note: Reuse evidence quality and seal verification.
  - id: D-0037
    type: depends_on
    note: Reuse deterministic artifact binding patterns.
alternatives:
  - id: A-001
    name: Build a hosted GRC database
    verdict: rejected
    reason: Compliance evidence should remain close to code and reviewable without a vendor.
  - id: A-002
    name: Use full OSCAL as the first local format
    verdict: rejected
    reason: OSCAL is powerful but too heavy for a decision-first v1; Horizon profiles can be converted later.
  - id: A-003
    name: Treat scanners as compliance
    verdict: rejected
    reason: Technical findings do not prove which human or agent decision authorized a control implementation.
policy:
  mode: block
  requireEvidence: attributed
evidence:
  - id: E-001
    type: commit
    value: ade4338d90e8989320a0d80e89d107d7adcdfb16
    strength: strong
    note: Implementation commit for local compliance profiles, reports, CLI, MCP tools, tests, and documentation
  - id: E-002
    type: link
    value: https://github.com/oscal-compass/compliance-trestle
    title: Compliance Trestle
    strength: moderate
    note: Mature OSCAL compliance-as-code platform; Horizon stays narrower and decision/evidence-focused
  - id: E-003
    type: link
    value: https://in-toto.io/
    title: in-toto
    strength: moderate
    note: Statement subject format used by the local compliance report
---

## Summary

Add local compliance profiles that map controls to Horizon decisions and evidence, producing deterministic hash-bound compliance reports.

## Context

Compliance tools usually manage control catalogs or documents. Horizon already has the missing operational layer: durable decisions, alternatives, evidence seals, Git attribution, and policy gates. Enterprise teams need to connect those artifacts to controls without shipping private context to another service.

Research into OSCAL, OpenControl, compliance-as-code, and GitOps GRC tools found strong catalog interchange but little direct decision-evidence evaluation at the point of code change.

## Decision

Add JSON/YAML compliance profiles, `horizon workspace compliance export/inspect/verify`, and read-only MCP tools. Embed the workspace pack and profile in a hash-bound in-toto report, re-evaluate controls during verification, and expose deterministic passing/failing control counts. Keep the core engine free and leave framework-specific mappings as a separate enterprise content layer.

## Consequences

Users can define a security, incident-response, privacy, or contract baseline and verify it without a hosted service. Framework packs can be monetized as curated mappings and playbooks, while the report remains portable and importable.
