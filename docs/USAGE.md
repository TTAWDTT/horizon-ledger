# Usage

```bash
horizon init --mcp
horizon add --title "Use SQLite for local storage" --summary "SQLite is simple and portable."
horizon list
horizon show D-0001
horizon update D-0001 --status decided
horizon evidence D-0001 --type link --value https://sqlite.org --note "SQLite docs" --strength strong
horizon seal D-0001 E-001
horizon link D-0001 D-0002 --type supersedes
horizon search sqlite
horizon why sqlite
horizon why src/core/storage.ts
horizon context src/core/storage.ts --max-tokens 2000
horizon score
horizon validate
horizon conflicts
horizon audit
horizon pr-context --base main --head HEAD
horizon trace --base main --head HEAD
horizon graph
horizon gate --base main --head HEAD
horizon gate --base main --head HEAD --report horizon-gate.json
horizon report horizon-gate.json
horizon export --format markdown --out DECISIONS.md
horizon doctor
horizon web
horizon mcp

horizon workspace init
horizon workspace add ../another-repo --name another-repo
horizon workspace list
horizon workspace disable ../another-repo
horizon workspace enable ../another-repo
horizon workspace remove ../another-repo
horizon workspace get D-0001
horizon workspace validate
horizon workspace audit
horizon workspace pr-context --base main --head HEAD
horizon workspace gate --base main --head HEAD
horizon workspace export --format markdown --out WORKSPACE.md
horizon workspace pack export --out WORKSPACE-PACK.json
horizon workspace pack inspect WORKSPACE-PACK.json
horizon workspace pack import WORKSPACE-PACK.json
horizon workspace evidence export --base main --head HEAD --out EVIDENCE-PACK.json
horizon workspace evidence inspect EVIDENCE-PACK.json
horizon workspace evidence verify EVIDENCE-PACK.json --expect-verdict pass
horizon workspace context storage --max-tokens 2000
horizon workspace trace --base main --head HEAD

horizon workspace release export --base main --head HEAD --out RELEASE-AUDIT.json
horizon workspace release inspect RELEASE-AUDIT.json
horizon workspace release verify RELEASE-AUDIT.json --expect-verdict pass

horizon workspace compliance export COMPLIANCE-PROFILE.yaml --out COMPLIANCE-REPORT.json
horizon workspace compliance inspect COMPLIANCE-REPORT.json
horizon workspace compliance verify COMPLIANCE-REPORT.json --expect-profile-id security-baseline
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

## Workspaces

A workspace aggregates decisions from several Horizon roots without copying or centralizing them. The workspace config stays local and Git-friendly:

```json
{
  "version": 1,
  "name": "Platform Workspace",
  "roots": [
    { "id": "r-001", "name": "api", "path": "../api", "enabled": true },
    { "id": "r-002", "name": "web", "path": "../web", "enabled": true }
  ]
}
```

Use it when a decision spans a monorepo package, service, client, or infrastructure repository. `workspace export` creates a portable review or audit report with root provenance and evidence findings. `workspace context` preserves the root name and path as provenance, while `workspace validate` checks every enabled root as one graph. Duplicate decision IDs, contradictory alternatives, dangling relationships, unreadable roots, and missing local evidence are reported together. Workspace config itself is also validated for duplicate IDs, duplicate names, duplicate resolved paths, unsafe metadata paths, and invalid enabled values; read or write commands fail with structured diagnostics instead of treating corruption as an absent workspace. `workspace audit` resolves local paths and Git commits inside each root instead of using the workspace root as a blanket target.

### Release audit action

```yaml
- uses: TTAWDTT/horizon-ledger/.github/actions/release-audit@main
  with:
    base-sha: ${{ github.event.pull_request.base.sha }}
    head-sha: ${{ github.event.pull_request.head.sha }}
    root: .
    artifact: true
```

The Action exposes `release-audit`, `release-audit-id`, `gate-verdict`, `trace-commits`, `attributed-commits`, and `unattributed-commits` outputs and uploads the JSON audit.

### Compliance report action

```yaml
- uses: TTAWDTT/horizon-ledger/.github/actions/compliance@main
  with:
    profile: compliance/profile.yaml
    root: .
    artifact: true
```

The Action uploads the JSON report and exposes `report-id`, `profile-id`, `passing-controls`, and `failing-controls`. The step fails when a control fails, while the artifact upload still runs with `always()`.

### Workspace PR action

```yaml
- uses: TTAWDTT/horizon-ledger/.github/actions/pr-context@main
  with:
    base-sha: ${{ github.event.pull_request.base.sha }}
    head-sha: ${{ github.event.pull_request.head.sha }}
    root: .
    workspace: true
    comment: true
```

Use `workspace: true` when `.horizon/workspace.json` describes packages inside one monorepo checkout.

For a monorepo workspace, use the same action with workspace aggregation:

```yaml
- uses: TTAWDTT/horizon-ledger/.github/actions/validate@main
  with:
    root: .
    strict: true
    workspace: true
```


