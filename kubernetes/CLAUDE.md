# kubernetes/ — Kubernetes Operator

> Navigation: [Root](../CLAUDE.md)

## Purpose

Owns the Kubernetes operator that manages `BatchSandbox` and `Pool` CRDs, the in-pod `task-executor` binary, Kustomize overlays, and the Helm chart. Does not own the lifecycle HTTP API (that lives in `server/`) or the in-sandbox execution daemon (`components/execd/`).

For detailed development setup, architecture deep-dive, coding standards, testing guide, and deployment workflows, see [DEVELOPMENT.md](./DEVELOPMENT.md).

## Entry Points

- `apis/sandbox/v1alpha1/` — CRD Go type definitions (source of truth for API shapes)
- `internal/controller/batchsandbox_controller.go` — BatchSandbox reconciler
- `internal/controller/pool_controller.go` — Pool reconciler
- `internal/controller/allocator.go` — in-memory allocation store and annotation syncer
- `cmd/controller/` — controller manager entry point
- `cmd/task-executor/` — task-executor entry point

## Directory Map

```text
kubernetes/
├── apis/sandbox/v1alpha1/      # CRD type definitions
├── cmd/
│   ├── controller/             # Controller manager entry point
│   └── task-executor/          # Task-executor entry point
├── internal/
│   ├── controller/             # BatchSandbox + Pool reconcilers, allocator, strategies
│   │   ├── batchsandbox_controller.go
│   │   ├── pool_controller.go
│   │   ├── allocator.go
│   │   ├── strategy/           # PoolStrategy, TaskSchedulingStrategy interfaces
│   │   ├── eviction/           # Pod eviction handler
│   │   └── pool_update.go      # Rolling update logic
│   ├── scheduler/              # TaskScheduler (task-to-pod assignment, recovery)
│   ├── task-executor/          # Task execution runtime, manager, HTTP server
│   └── utils/                  # Shared helpers (pod, finalizer, field index, logging)
├── pkg/
│   ├── client/                 # Generated clientset, informers, listers
│   └── task-executor/          # Task-executor public types and config
├── config/                     # Kustomize overlays, RBAC, CRD bases, samples
├── charts/opensandbox-controller/  # Helm chart
└── test/
    ├── e2e/                    # Kind-based E2E tests (core)
    ├── e2e_task/               # Task-executor E2E tests
    └── e2e_runtime/            # Runtime-class E2E tests (gVisor)
```

## Key Flows

### 1. Pool Allocation

1. `PoolReconciler` schedules pods and assigns them to a `BatchSandbox` via annotation.
2. Annotation written: `sandbox.opensandbox.io/alloc-status: {"pods":["pod-1","pod-2"]}`.
3. `BatchSandboxReconciler` reads the annotation and dispatches tasks through `TaskScheduler`.
4. `TaskScheduler` sends execution requests to the `task-executor` HTTP server inside the pod.

### 2. CRD Change → Manifest Regeneration

1. Edit Go types in `apis/sandbox/v1alpha1/`.
2. Run `make manifests generate` to regenerate CRD YAML and DeepCopy methods.
3. Run `make test` to verify controller and allocator changes.

### 3. Rolling Update

1. Pool spec changes trigger `pool_update.go` logic.
2. Old pods are evicted gradually; new pods are scheduled with the updated spec.
3. `pool-revision` label tracks which pods belong to each revision.

## Annotation Contracts

These annotations are internal but stability-sensitive:

| Annotation | Shape | Writer | Readers |
|---|---|---|---|
| `sandbox.opensandbox.io/alloc-status` | `{"pods":["pod-1"]}` | `allocator.go`, `apis.go` | `batchsandbox_controller.go` |
| `sandbox.opensandbox.io/alloc-release` | `{"pods":["pod-3"]}` | controller | `batchsandbox_controller.go` |

Do not change annotation keys or JSON shapes without updating all writers and readers.

## Label Contracts

- `sandbox.opensandbox.io/pool-name` — labels pool-owned pods
- `sandbox.opensandbox.io/pool-revision` — revision hash for rolling updates
- `batch-sandbox.sandbox.opensandbox.io/pod-index` — pod index within a BatchSandbox

## Tests

```bash
cd kubernetes

# Setup envtest
make setup-envtest

# Unit tests (envtest-based, Ginkgo/Gomega)
make test

# Focused unit test (standard testing)
go test ./internal/controller/ -run TestAllocatorSchedule -v

# Focused Ginkgo suite test
go test ./internal/controller/ -run TestControllers -v -ginkgo.focus='Pool allocate'

# Build
make build

# Lint
make lint

# E2E tests (requires Kind + Docker)
make test-e2e          # Full suite
make test-e2e-main     # Core e2e only
```

For E2E failure diagnosis, see [docs/E2E-TROUBLESHOOTING.md](./docs/E2E-TROUBLESHOOTING.md).

## Deployment

```bash
cd kubernetes

# Run controller locally
make run

# Deploy via Kustomize
make deploy

# Deploy via Helm
make helm-install

# Regenerate CRD manifests and DeepCopy
make manifests generate
```

## Working Notes

- Always run `make manifests generate` after changing `apis/` types — CRD YAML and DeepCopy methods must stay in sync.
- Keep reconciler logic idempotent — controllers may reconcile the same object concurrently.
- Preserve annotation backward compatibility; add new fields rather than renaming existing ones.
- Do not put business logic directly in reconciler `Reconcile()` — delegate to helpers, strategies, or allocators.
- Use envtest for unit tests; reserve Kind-based E2E for integration validation.
- CRD spec field removal or renaming is a breaking change — ask before doing it.

## Scan Snapshot

- Date: 2026-04-27
- Scope: AGENTS.md, directory listing of internal/ and apis/
