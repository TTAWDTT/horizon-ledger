---
id: D-0023
title: Ship a reusable Horizon policy gate Action
status: decided
createdAt: 2026-09-26T14:34:21.029Z
updatedAt: 2026-09-26T14:34:21.301Z
confidence: high
horizon: short
kind: engineering
scope:
  - .github/actions/gate/action.yml
  - .github/workflows/test.yml
  - README.md
  - docs/POLICY.md
tags:
  - ci
  - github-action
  - policy
owner: Codex
links:
  - id: D-0021
    type: depends_on
    note: The Action wraps the deterministic gate CLI.
alternatives:
  - id: A-001
    name: Tell users to add raw bun commands
    verdict: rejected
    reason: Raw commands are easy to get wrong in PR and push events.
  - id: A-002
    name: Run the gate from the validate Action
    verdict: rejected
    reason: Validation is useful without policies and should not gain strictness by accident.
  - id: A-003
    name: Gate only from this repository workflows
    verdict: rejected
    reason: Reusable adoption is a core part of the gate contract.
policy:
  mode: block
  requireEvidence: verified
evidence:
  - id: E-001
    type: file
    value: .github/actions/gate/action.yml
    note: Composite action contract
    strength: strong
  - id: E-002
    type: file
    value: .github/workflows/test.yml
    note: CI dogfooding and full Git history
    strength: strong
  - id: E-003
    type: doc
    value: docs/POLICY.md
    note: CI usage for single and monorepo roots
    strength: strong
  - id: E-004
    type: file
    value: README.md
    note: Public installation and usage
    strength: strong
---

## Summary

A composite GitHub Action can run single-root or workspace policy gates directly in pull-request CI.

## Context

Users already use Horizon validation in CI, but a separate gate wrapper makes the opt-in policy contract obvious and keeps the gate output in the step summary.

## Decision

Add `.github/actions/gate`. The Action installs Horizon from this repository, runs `horizon gate` or `horizon workspace gate`, writes the verdict to the step summary, and preserves the CLI exit code. Dogfood the Action in the test workflow.

## Consequences

Teams can enforce evidence-backed decisions without hand-writing bun invocations. The gate remains opt-in: only decisions with `policy` can fail.
