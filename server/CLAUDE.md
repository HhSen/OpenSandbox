# server/ — Lifecycle Control Plane

> Navigation: [Root](../CLAUDE.md)

## Purpose

Owns the Python FastAPI lifecycle server. Handles sandbox create/pause/resume/kill, pre-warm pool management, proxy routing, and diagnostics. Does not own API contract definitions (those live in `specs/`) or in-sandbox execution (owned by `components/execd/`).

## Entry Points

- `opensandbox_server/main.py` — app entry point and startup wiring
- `opensandbox_server/api/lifecycle.py` — sandbox lifecycle routes
- `opensandbox_server/api/pool.py` — pre-warm pool routes
- `opensandbox_server/services/sandbox_service.py` — core sandbox business logic
- `opensandbox_server/services/factory.py` — selects Docker or Kubernetes runtime

## Directory Map

```text
server/
├── opensandbox_server/
│   ├── main.py                # App entry + startup wiring
│   ├── config.py              # Config loading (TOML + env)
│   ├── api/
│   │   ├── lifecycle.py       # Sandbox lifecycle routes (create/pause/resume/kill)
│   │   ├── pool.py            # Pre-warm pool management routes
│   │   ├── proxy.py           # Port proxy routes
│   │   ├── devops.py          # Diagnostics routes (logs, events, inspect)
│   │   └── schema.py          # Request/response Pydantic schemas
│   ├── services/
│   │   ├── sandbox_service.py # Core sandbox logic
│   │   ├── docker.py          # Docker runtime implementation
│   │   ├── k8s/               # Kubernetes runtime implementation
│   │   ├── factory.py         # Runtime resolver (Docker vs Kubernetes)
│   │   ├── helpers.py         # Shared service helpers
│   │   ├── validators.py      # Input validation
│   │   └── runtime_resolver.py
│   ├── integrations/          # Optional external integrations
│   └── extensions/            # Extension plugins
└── tests/                     # Unit, integration, smoke, and Kubernetes-focused tests
```

## Key Flows

### 1. Sandbox Create

1. `POST /sandboxes` hits `api/lifecycle.py`.
2. Route delegates to `services/sandbox_service.py`.
3. `factory.py` selects Docker or Kubernetes runtime based on config.
4. Runtime creates the container; `execd` starts inside.
5. Response includes sandbox ID and endpoint info.

### 2. Pre-Warm Pool

1. Pool config defines image + resource spec.
2. Server pre-creates sandboxes and holds them warm.
3. `api/pool.py` exposes pool state and resize endpoints.
4. When a create request arrives with a matching spec, a warm sandbox is returned immediately.

### 3. Diagnostics

1. `api/devops.py` exposes logs, inspect, events, and summary for a sandbox ID.
2. Routes delegate to `services/docker_diagnostics.py` (Docker path) or Kubernetes equivalents.

## Interfaces and Dependencies

- **API contract**: defined by `specs/sandbox-lifecycle.yml` — update schemas there first, then here.
- **Runtime interface**: `services/factory.py` returns a runtime object implementing the sandbox lifecycle protocol.
- **Config**: TOML file at `~/.sandbox.toml` or `SANDBOX_CONFIG_PATH`; loaded via `config.py`.
- **execd**: not called directly; client SDKs connect to execd inside the sandbox container.

## Tests

```bash
cd server
uv sync --all-groups

# Lint
uv run ruff check

# Type check
uv run pyright

# Focused checks
uv run pytest tests/test_docker_service.py
uv run pytest tests/test_schema.py

# Full suite
uv run pytest

# Smoke test (requires Docker)
chmod +x tests/smoke.sh && ./tests/smoke.sh
```

Known gap: Kubernetes runtime paths have limited unit test coverage; rely on E2E tests in `tests/`.

## Working Notes

- Keep FastAPI routes thin — delegate all behavior to services, validators, or runtime helpers.
- Extend existing fixtures and helpers before adding parallel abstractions.
- Docker and Kubernetes paths share the `sandbox_service` interface; do not add Docker-only assumptions that break the Kubernetes path.
- Config shape changes are user-visible — ask before changing defaults or removing fields.

## Scan Snapshot

- Date: 2026-04-27
- Scope: AGENTS.md, directory listing of api/ and services/
