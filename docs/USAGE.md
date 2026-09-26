# Usage

```bash
horizon init --mcp
horizon add --title "Use SQLite for local storage" --summary "SQLite is simple and portable."
horizon list
horizon show D-0001
horizon update D-0001 --status decided
horizon evidence D-0001 --type link --value https://sqlite.org --note "SQLite docs" --strength strong
horizon link D-0001 D-0002 --type supersedes
horizon search sqlite
horizon why sqlite
horizon why src/core/storage.ts
horizon score
horizon validate
horizon conflicts
horizon audit
horizon graph
horizon export --format markdown --out DECISIONS.md
horizon doctor
horizon web
horizon mcp
```

Use `--root <path>` to run against another repository.

## Web dashboard

```bash
horizon web --port 4173
```

The dashboard exposes a local-only API at `/api/ledger` and includes the ledger, scores, graph, and diagnostics. It intentionally has no remote dependencies, so private decision context stays on your machine.

## GitHub Action

```yaml
- uses: TTAWDTT/horizon-ledger/.github/actions/validate@main
  with:
    root: .
    strict: true
```

Set `strict: false` to allow warnings while still catching errors.

## Import existing ADRs

```bash
horizon import-adr docs/adr --dry-run
horizon import-adr docs/adr
```

The importer creates a Horizon decision from the ADR title, status, context, decision, consequences, considered options, and links. It preserves the original Markdown as evidence and skips files that were already imported.
