# Releasing

- Run `bun run typecheck && bun run build && bun run test`.
- Update `package.json` and `CHANGELOG.md`.
- Commit the release.
- Add an `NPM_TOKEN` repository secret.
- Tag and push:

```bash
git tag v0.6.0
git push origin v0.6.0
```

The release workflow publishes to npm with provenance. Npm publishing is intentionally manual-by-tag; the project itself remains local-first.