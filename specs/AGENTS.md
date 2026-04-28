# Specs AGENTS

You are maintaining OpenSandbox public API contracts. Treat the spec files in this directory as the source of truth for public interfaces and prefer additive changes.

## Scope

- `sandbox-lifecycle.yml` — lifecycle API used by `server/` and sandbox SDKs
- `execd-api.yaml` — execution API used by `components/execd/` and code-interpreter SDKs
- `egress-api.yaml` — egress sidecar API
- `diagnostic-api.yml` — diagnostics API (logs/events); no SDK clients are currently generated from this
- `README*.md`

When a contract change affects downstream code, also read the nearest consumer guide:

- `../server/AGENTS.md` for lifecycle server impact
- `../sdks/AGENTS.md` for SDK-facing contract changes

## Contract Map

| Spec | Consumers | Code generation |
|------|-----------|-----------------|
| `sandbox-lifecycle.yml` | `server/`, all sandbox SDKs | Python, JS, Kotlin, Go (not C#) |
| `execd-api.yaml` | `components/execd/`, code-interpreter SDKs | Python, JS, Kotlin, Go (not C#) |
| `egress-api.yaml` | `components/egress/` | Python, JS, Kotlin, Go (not C#) |
| `diagnostic-api.yml` | `server/` (diagnostics endpoints) | **No SDK generation** — orphaned spec |

## Codegen Regeneration

After editing any spec, regenerate all language clients:

| Language | Command |
|----------|---------|
| Python | `cd sdks/sandbox/python && uv run python scripts/generate_api.py` |
| JS/TS | `cd sdks/sandbox/javascript && pnpm run gen:api` |
| Kotlin | `cd sdks/sandbox/kotlin && ./gradlew :sandbox-api:generateLifecycleApi :sandbox-api:generateExecdApi :sandbox-api:generateEgressApi` |
| Go | `cd sdks/sandbox/go && make generate` |

**Note:** Go SDK vendored spec copies live in `sdks/sandbox/go/api/specs/` — update them when specs change.

## Commands

Regenerate docs output:

```bash
node scripts/spec-doc/generate-spec.js
cd docs
pnpm docs:spec
```

Lifecycle consumer validation:

```bash
cd server
uv sync --all-groups
uv run ruff check
uv run pytest
```

SDK workspace setup for affected SDK regeneration:

```bash
cd sdks
pnpm install --frozen-lockfile
```

## Guardrails

Always:

- Keep operation IDs, schema names, examples, and descriptions consistent with existing naming.
- Regenerate derived outputs after spec edits.
- Update affected consumers in the same change when practical.
- Call out downstream areas you did not verify.

Ask first:

- Breaking contract changes
- Renaming or removing public fields or operations
- Adding a new top-level API surface without implementation alignment

Never:

- Rename or remove public fields without approval.
- Hand-edit derived outputs without updating the source spec.
- Assume a spec-only edit is isolated from server, SDK, docs, or release impact.

## Good Patterns

- Concrete examples and descriptions when behavior changes
- Explicit backward-compatible field additions instead of field redefinition
- Contract and consumer updates landing together
