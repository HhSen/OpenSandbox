# components/internal — Shared Go Library

**Generated:** 2026-04-28 | **Branch:** dev | **Commit:** 451c346

## OVERVIEW
Internal Go module (`github.com/alibaba/opensandbox/internal`) shared across `execd`, `ingress`, and `egress`. Provides structured logging, OpenTelemetry instrumentation, safe goroutine wrappers, and version metadata. Not a public API — `internal/` path enforces Go import restrictions.

## STRUCTURE
```
components/internal/
├── logger/      # Structured log helpers (zap-based)
├── telemetry/   # OpenTelemetry setup and span helpers
├── safego/      # Panic-safe goroutine launcher (recover + log)
└── version/     # Build-time version injection
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add shared log field | `logger/` |
| Add OTEL span/metric | `telemetry/` |
| Safe goroutine wrapper | `safego/` |
| Version metadata | `version/` |

## CONVENTIONS
- Module path is `github.com/alibaba/opensandbox/internal` (lowercase `opensandbox`) — differs from Go SDK (`OpenSandbox` with capital O); do not conflate
- Only `components/execd`, `components/ingress`, `components/egress` may import this module; not for use in `kubernetes/` or `sdks/`

## ANTI-PATTERNS
- Never expose types here that couple to execd/ingress/egress domain logic — this must stay pure utility
- Never import this module from `kubernetes/` or SDK code (different Go module boundaries)
- Do not add domain-specific logic here; keep it infrastructure-only

## COMMANDS
```bash
cd components/internal
go build ./...
go test ./...
```
