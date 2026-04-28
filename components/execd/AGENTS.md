# execd — In-Sandbox Execution Daemon

**Generated:** 2026-04-28 | **Branch:** dev | **Commit:** 451c346

## OVERVIEW
Go HTTP server running inside sandbox containers; handles command execution, filesystem CRUD, code interpretation (Jupyter), PTY, and SSE streaming. Implements `specs/execd-api.yaml`.

## STRUCTURE
```
components/execd/
├── main.go                    # Entry: flag parse, HTTP server bootstrap
├── bootstrap.sh               # Container startup script
├── pkg/
│   ├── web/
│   │   ├── controller/        # HTTP handlers (32 files — largest area)
│   │   │   ├── command.go     # Command execution + session tracking
│   │   │   ├── filesystem.go  # File CRUD; platform splits: _windows.go
│   │   │   ├── codeinterpreting.go  # Code context lifecycle
│   │   │   ├── sse.go         # SSE helpers used across controllers
│   │   │   ├── pty_ws.go      # WebSocket PTY handler
│   │   │   └── metric.go      # CPU/memory metrics + SSE watch
│   │   └── model/             # Request/response structs
│   ├── runtime/               # Execution runtime (32 files); process mgmt, sandbox env
│   ├── jupyter/               # Jupyter kernel lifecycle + execution
│   │   ├── kernel/            # Kernel spawn and management
│   │   ├── execute/           # Code execution via ZMQ
│   │   ├── session/           # Session state
│   │   └── auth/              # Jupyter token auth
│   ├── util/                  # Path helpers, glob matching
│   ├── clone3compat/          # Linux clone3 syscall compat layer
│   ├── telemetry/             # OpenTelemetry instrumentation
│   └── log/                   # Structured logging
├── docs/                      # Design notes and PTY docs
└── tests/                     # Integration tests (require running container)
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| New execd API endpoint | `pkg/web/controller/` + `pkg/web/model/` |
| Command session handling | `controller/command.go` |
| File upload/download | `controller/filesystem_upload.go`, `filesystem_download.go` |
| Jupyter code exec | `pkg/jupyter/execute/` |
| PTY (browser terminal) | `controller/pty_ws.go`, `controller/pty_controller.go` |
| Process isolation | `pkg/runtime/` |
| Metrics streaming | `controller/metric.go` (SSE) |
| Linux syscall compat | `pkg/clone3compat/` |

## CONVENTIONS
- Platform splits via build-tag files: `_linux.go`, `_windows.go`, `syscall_linux.go`, `syscall_others.go`
- All controller tests use `mock_test.go` + `test_helpers.go`; no real container needed for unit tests
- SSE: events serialized via `sse.go` helpers; never write raw `data:` strings inline
- Auth token: `X-EXECD-ACCESS-TOKEN` header; validated in middleware before routing
- Dependencies shared with `components/ingress` and `components/egress` via `components/internal` module (`github.com/alibaba/opensandbox/internal`)

## ANTI-PATTERNS
- Never put business logic in `main.go` — it only bootstraps
- Do not cross-import between `execd`, `ingress`, and `egress` pkg trees; use `components/internal/` for shared code
- Never block SSE stream goroutines without an abort/context signal; leaks in long-lived containers
- `filesystem_windows.go` and `syscall_others.go` are stubs — do not add Linux-only logic in shared files

## COMMANDS
```bash
cd components/execd
go build ./...
go test ./...

# Lint
golangci-lint run

# Build binary
./build.sh
```

## NOTES
- PTY.md in root of this module explains the WebSocket PTY protocol
- RELEASE_NOTES.md tracks breaking changes to the execd HTTP API
- `pkg/clone3compat/` exists because gVisor and older kernels don't support `clone3(2)` — do not remove
