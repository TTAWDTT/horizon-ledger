# Change gate

The Horizon change gate is a deterministic check for files that are about to change or have already changed. It does not replace tests, reviews, or branch protection. It answers one narrow question: does a governed decision currently allow this change?

```bash
horizon gate --base main --head HEAD
horizon gate --file src/core/storage.ts
horizon gate --base main --head HEAD --format json
```

## Policy field

Policies are opt-in. A decision without `policy` is context only:

```yaml
policy:
  mode: block
  requireEvidence: verified
```

- `mode: observe` records context but never fails.
- `mode: review` warns.
- `mode: block` fails when the policy requirements are not met.
- `requireEvidence: any` accepts any attached evidence.
- `requireEvidence: verified` requires at least one locally verified evidence target.
- `requireEvidence: strong` requires verified evidence with `strength: strong`.

A blocking decision must be `decided` and have the requested evidence. Missing evidence, non-decided status, and relevant conflicts become gate findings. Invalid policy metadata is reported as a validation error instead of being silently ignored.

## MCP

Agents can call `horizon_gate` with changed paths or a base/head range. It is read-only and returns structured findings, so a host can decide whether to warn, stop, or continue with human review. With MCP writes enabled, `horizon_create` and `horizon_update` can set the same policy field.

## CI

`horizon gate` exits non-zero on `block`. Use it when you want Horizon to participate in branch protection, and use `mode: review` when you only want advisory warnings.


