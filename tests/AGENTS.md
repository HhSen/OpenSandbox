# tests — Cross-Component E2E Tests

**Generated:** 2026-04-28 | **Branch:** dev | **Commit:** 451c346

## OVERVIEW
Real E2E test suites (one per language) that exercise the full sandbox lifecycle — server + execd + Docker runtime. All require a live server; run on self-hosted CI runners or locally with Docker.

## STRUCTURE
```
tests/
├── python/        # pytest (async session-scoped event loop)
│   ├── tests/     # Feature-grouped test files
│   └── Makefile   # Shortcuts: test, test-kubernetes-mini, test-sandbox, test-manager, test-code
├── javascript/    # vitest (15-min timeout, sequential — non-concurrent)
│   └── tests/
├── java/          # JUnit 5 + Gradle; uses mavenLocal SDK snapshots
│   └── src/test/java/com/alibaba/opensandbox/e2e/
├── go/            # stdlib testing + testify
└── csharp/        # xunit + FluentAssertions, .NET 10
    └── OpenSandbox.E2ETests/
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Python E2E sandbox lifecycle | `python/tests/` |
| JS E2E tests | `javascript/tests/*.test.ts` |
| Java E2E | `java/src/test/java/.../e2e/` |
| Go E2E | `go/` (13 test files) |
| C# E2E | `csharp/OpenSandbox.E2ETests/` |

## CONVENTIONS
- **Setup required**: all tests need a running `opensandbox-server` + Docker + a live execd image
- E2E orchestration via `scripts/*-e2e.sh` — these build execd from source, start the server, seed test data, then run the suite
- **Java E2E** requires both Kotlin SDKs published to Maven local first: `cd sdks/sandbox/kotlin && ./gradlew publishToMavenLocal`, then `cd sdks/code-interpreter/kotlin && ./gradlew publishToMavenLocal`; tests use `latest.integration` version
- **JS E2E** is forced sequential (`sequence.concurrent: false` in vitest config) — do not parallelize
- **Python E2E** uses a session-scoped async event loop; `pytest-timeout` default is 300s per test
- **self-hosted CI runners only** for `real-e2e.yml` workflow; GitHub-hosted runners lack the Docker setup

## ANTI-PATTERNS
- Do not run E2E tests without a live server — they will silently fail or hang
- Do not parallelize JS E2E tests (vitest config enforces sequential)
- Do not import SDK source directly in Java E2E — publish to Maven local first
- Do not add unit tests here — unit tests belong in `sdks/*/tests/` or `server/tests/`

## COMMANDS
```bash
# Python E2E (full orchestration from scratch)
bash scripts/python-e2e.sh

# Python focused (assumes server running)
cd tests/python && uv run pytest tests/ -v

# JavaScript E2E
bash scripts/javascript-e2e.sh

# Go E2E
bash scripts/go-e2e.sh

# Java E2E
bash scripts/java-e2e.sh

# C# E2E
bash scripts/csharp-e2e.sh
```
