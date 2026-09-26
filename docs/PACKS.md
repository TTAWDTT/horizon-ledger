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
