# Compliance profiles

Horizon can evaluate a local control profile against the decisions and evidence already in your Git history. It is not a GRC database, not a scanner, and not a hosted compliance service. It answers one useful question: **which decisions and evidence currently satisfy this control?**

```bash
horizon workspace compliance export compliance/profile.yaml --out compliance-report.json
horizon workspace compliance inspect compliance-report.json
horizon workspace compliance verify compliance-report.json --expect-profile-id security-baseline
```

The export exits non-zero when any control fails, so it can be used as an optional CI gate without replacing technical security scanners.

## Profile format

Profiles may be JSON or YAML. A profile is a small, human-readable control set:

```yaml
schemaVersion: 1
id: security-baseline
name: Security baseline
version: 1.0.0
framework: internal-security
description: Minimum review and evidence controls for changes that touch auth.
controls:
  - id: AC-01
    title: Authentication decisions are durable
    requirement: A decided decision with verified evidence must cover authentication.
    scopes:
      - src/auth
    requireEvidence: verified
  - id: EVD-01
    title: Incident response is documented
    requirement: One decided incident-response decision must have sealed evidence.
    tags:
      - incident-response
    requireEvidence: sealed
    minimumDecisions: 1
```

A control selects decisions by:

- `decisionIds` — explicit required decision ids
- `tags` — one or more decision tags
- `scopes` — exact or parent paths in decision scope
- `roots` — workspace root names

A control can also require a specific decision `status` (`decided` by default) and one of the existing evidence levels: `any`, `verified`, `strong`, `sealed`, or `attributed`.

## Report format

A report is a single versioned JSON file with:

- `kind`: `horizon.compliance-report`
- `schemaVersion`: `1`
- `reportId`: canonical SHA-256 of the payload excluding the id
- producer version and creation time
- the embedded decision pack and control profile with canonical SHA-256 digests
- deterministic evidence findings for selected decisions
- per-control selected decisions, satisfied decisions, findings, status, and reason
- an [in-toto Statement v1](https://in-toto.io/Statement/v1) subject set and a Horizon compliance predicate

Verification re-parses the pack, validates both embedded digests, re-evaluates every control, and checks statement/summary consistency.

## Contract

- Export is read-only and local.
- Profiles do not decide whether evidence is trustworthy; evidence and Git history do.
- The report is a point-in-time snapshot, not a remote synchronization source.
- No framework content is bundled. Bring your own internal baseline, customer contract control, SOC 2 mapping, or private profile.
- The in-toto Statement is signature-envelope ready for an external DSSE/Sigstore workflow.

## Enterprise packs

The local engine is open source. Framework-specific control mappings, review playbooks, and organization-specific policy packs can be sold separately because they contain curated content rather than core capability. The report remains importable and exportable, so a paid pack must never hold the ledger hostage.
