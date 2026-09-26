---
id: D-0025
title: Document GitHub-tag installation
status: decided
createdAt: 2026-09-26T14:39:42.428Z
updatedAt: 2026-09-26T14:39:42.561Z
confidence: high
horizon: short
kind: product
scope:
  - README.md
tags:
  - install
  - docs
  - package
owner: Codex
links:
  - id: D-0023
    type: depends_on
    note: Uses the same tagged release workflow as the reusable Action.
alternatives:
  - id: A-001
    name: Publish to npm manually
    verdict: rejected
    reason: Local npm credentials are unavailable, so this would be an unverified release path.
  - id: A-002
    name: Leave registry install instructions
    verdict: rejected
    reason: They point users to a nonexistent package.
  - id: A-003
    name: Remove install documentation
    verdict: rejected
    reason: A working Git install path is already available.
policy:
  mode: block
  requireEvidence: verified
evidence:
  - id: E-001
    type: doc
    value: README.md
    note: GitHub-tag install commands
    strength: strong
---

## Summary

The README should point users to the verified GitHub git package source until npm publishing is configured.

## Context

The npm registry returns 404 for horizon-ledger, so the previous registry install command could not actually install the project.

## Decision

Install from `github:TTAWDTT/horizon-ledger#v0.16.1` in Bun and npm examples. Keep the release workflow npm publish path optional, but do not imply registry availability that does not exist.

## Consequences

Users get a working install path immediately. When npm credentials are configured, a future release can reintroduce the short registry command with evidence.
