# Releasing

- Run `bun run typecheck && bun run test`.
- Update `CHANGELOG.md`.
- Commit and tag.
- Publish to npm when the core is stable and ready for external use.

The project should stay local-first; release publishing is just one downstream step.
