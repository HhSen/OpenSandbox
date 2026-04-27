# specs/ — Public API Contracts

> Navigation: [Root](../CLAUDE.md)

## Purpose

Owns the OpenAPI contract files that define all public sandbox interfaces. These are the source of truth for the lifecycle API (consumed by `server/` and sandbox SDKs), the execution API (consumed by `components/execd/` and code-interpreter SDKs), and the egress sidecar API. Does not own implementation — only contracts, examples, and descriptions.

## Entry Points

- `sandbox-lifecycle.yml` — lifecycle API (create, pause, resume, kill, pool management)
- `execd-api.yaml` — execution API (command run, file read/write)
- `egress-api.yaml` — egress sidecar API
- `diagnostic-api.yml` — diagnostics API (logs, inspect, events, summary)

## Directory Map

```text
specs/
├── sandbox-lifecycle.yml   # Lifecycle API: server/ and sandbox SDKs
├── execd-api.yaml          # Execution API: components/execd/ and code-interpreter SDKs
├── egress-api.yaml         # Egress sidecar API
├── diagnostic-api.yml      # Diagnostics API
├── README.md               # Public documentation (English)
└── README_zh.md            # Public documentation (Chinese)
```

## Key Flows

### 1. Spec Edit → Downstream Update

1. Edit the relevant `.yml`/`.yaml` file.
2. Regenerate docs output: `node scripts/spec-doc/generate-spec.js && cd docs && pnpm docs:spec`.
3. Regenerate affected SDK generated clients (see `sdks/CLAUDE.md`).
4. Update handwritten server schemas if `sandbox-lifecycle.yml` changed.
5. Run server tests and affected SDK checks.
6. Call out any downstream area you did not verify in the handoff.

### 2. Adding a New Field

1. Add the field with description and example in the spec file.
2. Prefer additive changes — do not rename or remove existing fields without approval.
3. Update affected server schema (`server/opensandbox_server/api/schema.py`) and SDK adapter layers.

## Interfaces and Dependencies

- `sandbox-lifecycle.yml` → consumed by `server/` (Pydantic schemas) and sandbox SDKs (generated clients).
- `execd-api.yaml` → consumed by `components/execd/` (Go implementation) and code-interpreter SDKs.
- `egress-api.yaml` → consumed by `components/egress/`.
- Spec files drive SDK code generation — changes here cascade to all language SDKs.

## Tests

```bash
# Regenerate docs
node scripts/spec-doc/generate-spec.js
cd docs && pnpm docs:spec

# Validate lifecycle server still passes after spec change
cd server
uv sync --all-groups
uv run ruff check
uv run pytest

# SDK workspace setup (before SDK regeneration)
cd sdks
pnpm install --frozen-lockfile
```

## Working Notes

- Keep operation IDs, schema names, examples, and descriptions consistent with existing naming.
- Never hand-edit derived outputs without updating the source spec.
- A spec-only edit is never isolated — it affects server, SDKs, docs, and release.
- Breaking changes (renaming/removing public fields or operations) require explicit approval.
- Regenerate derived outputs in the same PR as the spec change when practical.

## Scan Snapshot

- Date: 2026-04-27
- Scope: AGENTS.md, directory listing
