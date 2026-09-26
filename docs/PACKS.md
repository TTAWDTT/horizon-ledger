# Workspace packs

A workspace pack is a portable, inspectable handoff artifact. It is a single UTF-8 JSON file, not an archive and not live working-tree state.

```bash
horizon workspace pack export --out decision-pack.json
horizon workspace pack inspect decision-pack.json
horizon workspace pack import decision-pack.json
horizon workspace pack import decision-pack.json --write
```

## Format

A pack is versioned JSON with:

- `kind`: `horizon.workspace-pack`
- `schemaVersion`: `1`
- `packId`: canonical SHA-256 of the payload excluding `packId`
- producer version
- workspace name and decision count
- workspace root summaries
- raw decision Markdown plus the parsed decision
- per-decision Markdown SHA-256
- source conflicts and diagnostics
- audit summary

The pack intentionally does not include the working tree, Git patches, secrets, caches, or binaries.

## Import contract

- Default import is a read-only plan.
- `--write` is required to apply.
- Each source root becomes a deterministic import root under `horizon-imports/<pack-id-short>/<safe-root-name>`.
- Source root id, name, and path stay in the pack as provenance.
- A decision with the same id and equivalent content is reused.
- A same-id decision with different content is a conflict.
- A valid pack can be re-imported idempotently.

Use `workspace pack inspect` to verify a pack before reading it further. Use `workspace pack import` without `--write` when you want an explicit review plan.
## Decision evidence packages

A workspace pack says *what was decided*. A gate report says *what policy allowed*. An evidence package binds both into one portable JSON artifact:

```bash
horizon workspace evidence export --base main --head HEAD --out evidence-pack.json
horizon workspace evidence inspect evidence-pack.json
horizon workspace evidence verify evidence-pack.json --expect-verdict pass
```

## Format

A package is versioned JSON with:

- `kind`: `horizon.evidence-pack`
- `schemaVersion`: `1`
- `evidencePackId`: canonical SHA-256 of the payload excluding `evidencePackId`
- producer version and creation time
- two named artifacts:
  - `decision-pack.json` — the deterministic Horizon workspace pack
  - `gate-report.json` — the hash-bound Horizon workspace gate report
- canonical SHA-256 digests for each embedded artifact
- an [in-toto Statement v1](https://in-toto.io/Statement/v1) subject set and a Horizon decision-evidence predicate

Artifact digests are calculated over the canonical JSON serialization of the embedded object. The statement records the pack id, gate report id, gate digest, verdict, changed-file count, coverage, and workspace summary.

## Contract

- Export is read-only.
- The file contains decisions, gate findings, and provenance; it does not include secrets, binaries, caches, or a live worktree.
- Verification checks the package hash, both embedded artifact hashes, the workspace pack, the gate report, and statement consistency.
- `inspect` validates without writing.
- `verify` can additionally require exact pack, report, digest, or verdict values.
- No signing or network call is required. The embedded in-toto Statement is signature-envelope ready, so an external DSSE/Sigstore workflow can sign it when your environment has key management.

## CI

Use the reusable Action to publish a PR or release evidence package:

```yaml
- uses: TTAWDTT/horizon-ledger/.github/actions/evidence@main
  with:
    base-sha: ${{ github.event.pull_request.base.sha }}
    head-sha: ${{ github.event.pull_request.head.sha }}
    root: .
    artifact: true
```

The Action exposes `evidence-pack`, `evidence-pack-id`, and `gate-verdict` outputs and uploads the JSON package.
