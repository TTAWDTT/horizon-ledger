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
horizon graph
horizon export --format markdown --out DECISIONS.md
horizon doctor
horizon webhorizon mcp
```

Use `--root <path>` to run against another repository.

