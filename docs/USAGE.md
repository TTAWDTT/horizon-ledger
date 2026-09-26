# Usage

```bash
horizon init
horizon add --title "Use SQLite for local storage" --summary "SQLite is simple and portable."
horizon list
horizon show D-0001
horizon update D-0001 --status decided
horizon evidence D-0001 --type link --value https://sqlite.org --note "SQLite docs" --strength strong
horizon search sqlite
horizon why sqlite
horizon score
horizon validate
horizon graph
horizon mcp
```

Use `--root <path>` to run against another repository.
