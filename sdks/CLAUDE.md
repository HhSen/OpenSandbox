# sdks/ — Multi-Language SDKs

> Navigation: [Root](../CLAUDE.md)

## Purpose

Owns the handwritten adapters, generated API clients, and build tooling for all language SDKs: Python, JavaScript/TypeScript, Kotlin/Java, C#/.NET, and Go. Also owns the MCP server. Does not own API contract definitions (those live in `specs/`) or server logic.

## Entry Points

- `sandbox/python/` — Python sandbox SDK (`opensandbox` package)
- `sandbox/javascript/` — JavaScript/TypeScript sandbox SDK (`@alibaba-group/opensandbox`)
- `sandbox/kotlin/` — Kotlin/Java sandbox SDK (`com.alibaba.opensandbox:sandbox`)
- `sandbox/csharp/` — C#/.NET sandbox SDK (`Alibaba.OpenSandbox`)
- `sandbox/go/` — Go sandbox SDK
- `code-interpreter/` — Code Interpreter SDK (Python, JS, Kotlin, C#)
- `mcp/sandbox/python/` — MCP server exposing sandbox tools

## Directory Map

```text
sdks/
├── sandbox/
│   ├── python/
│   │   ├── src/opensandbox/api/   # Generated API client (do not hand-edit)
│   │   └── scripts/generate_api.py
│   ├── javascript/
│   │   └── src/api/*.ts           # Generated API client (do not hand-edit)
│   ├── kotlin/
│   │   └── sandbox-api/build/generated/  # Generated (do not hand-edit)
│   ├── csharp/
│   └── go/
├── code-interpreter/
│   ├── python/
│   ├── javascript/
│   ├── kotlin/
│   └── csharp/
├── mcp/
│   └── sandbox/python/            # MCP server
├── package.json                   # Workspace root
└── pnpm-workspace.yaml
```

## Generated Code

Never patch generated code as the only fix. Regenerate from spec instead.

Generated paths:
- `sandbox/python/src/opensandbox/api/**`
- `sandbox/javascript/src/api/*.ts`
- `sandbox/kotlin/sandbox-api/build/generated/**`

Handwritten logic belongs in adapters, services, facades, converters, and stable SDK models.

## Commands

```bash
# JavaScript workspace install
cd sdks
pnpm install --frozen-lockfile

# JavaScript SDK checks
pnpm run lint:js
pnpm run typecheck:js
pnpm run build:js
pnpm run test:js

# Python sandbox SDK
cd sdks/sandbox/python
uv sync
uv run python scripts/generate_api.py   # Regenerate from spec
uv run ruff check
uv run pyright
uv run pytest tests/ -v
uv build

# JavaScript sandbox SDK
cd sdks/sandbox/javascript
pnpm run gen:api                         # Regenerate from spec
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run test

# Kotlin sandbox SDK
cd sdks/sandbox/kotlin
./gradlew :sandbox-api:generateLifecycleApi :sandbox-api:generateExecdApi :sandbox-api:generateEgressApi
./gradlew spotlessApply :sandbox:test
```

## Key Flows

### 1. Spec-Driven SDK Update

1. Spec changes land in `specs/`.
2. Run the language-specific generator (`generate_api.py`, `pnpm run gen:api`, or Gradle generate tasks).
3. Update handwritten adapter/service layers to handle new or changed fields.
4. Run lint, typecheck, build, and tests for the affected language.
5. Match behavior across all languages unless a documented platform constraint prevents it.

### 2. Adding a New SDK Feature (Handwritten)

1. Add to adapter/service/facade layer — not in generated code.
2. Add regression tests for request mapping, response conversion, error mapping, and streaming behavior.
3. Implement the same capability in other languages when the SDK surface is cross-language.

## Interfaces and Dependencies

- **Wire format**: generated clients follow `specs/` contracts exactly. Public SDK models may differ (e.g., `timedelta` instead of seconds integer).
- **Unit separation**: keep wire-format units (seconds as integer) and SDK-public units (`timedelta`, `Duration`) separate. Do not leak wire units into public interfaces.
- **MCP server**: exposes sandbox tools; depends on the Python sandbox SDK.

## Tests

Run package-local validation first before widening to multi-language checks:

```bash
# Python focused
cd sdks/sandbox/python && uv run pytest tests/ -v

# JavaScript focused
cd sdks/sandbox/javascript && pnpm run test

# Kotlin focused
cd sdks/sandbox/kotlin && ./gradlew :sandbox:test
```

Key test areas: request mapping, response conversion, error mapping, streaming behavior, resource cleanup.

## Working Notes

- For spec-driven changes: regenerate → update handwritten layers → run checks.
- Match public behavior across languages unless a documented platform constraint prevents it.
- Keep package-local validation fast before widening to multi-language verification.
- Breaking public changes (renaming/removing SDK methods or types) require explicit approval.

## Scan Snapshot

- Date: 2026-04-27
- Scope: AGENTS.md, directory listing of sdks/
