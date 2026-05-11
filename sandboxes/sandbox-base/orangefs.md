# OrangeFS Usage in sandbox-base

## Overview

OrangeFS is a distributed POSIX filesystem used to persist Claude Code state across container restarts. The sandbox mounts two subpaths from the OrangeFS volume into the container via FUSE.

## Mount Layout

```
OrangeFS volume
└── {username}/
    ├── .claude/          → /root/.claude          (user-global Claude Code config)
    └── {task_id}/        → /workspace/{username}/{task_id}  (task workspace)
```

**User-global mount** (`{username}/.claude` → `/root/.claude`): shared across all tasks for a user. Contains Claude Code settings, CLAUDE.md, command history, hooks, and the `projects/` directory where Claude stores per-session conversation JSONL files.

**Task workspace mount** (`{username}/{task_id}` → `/workspace/{username}/{task_id}`): task-specific working files. The deep mount path is intentional — it gives each task its own bucket under `~/.claude/projects/` rather than all tasks colliding under a single `-workspace` project key. Pass the same `TASK_ID` to a new container to resume a previous task.

## Environment Variables

| Variable | Description |
|---|---|
| `USERNAME` | User identifier. Must match `^[a-zA-Z0-9_-]+$`. Determines the user-level subpath in OrangeFS. |
| `TASK_ID` | Task identifier. Must match `^[a-zA-Z0-9_-]+$`. Determines the task-level subpath. Optional — omitting it skips the workspace mount. |
| `ORANGEFS_RS_ADDR` | Registry server address (e.g. `10.14.127.65:8030`). |
| `ORANGEFS_TOKEN` | Authentication token. |
| `ORANGEFS_VOLUME` | Volume name (e.g. `cozeloop`). |

All five must be set for full persistence. Omitting `TASK_ID` gives only the `.claude` global mount. Omitting `USERNAME` (or if the binary is absent) skips all mounts.

## How the Mounts Are Established (entrypoint.sh)

### Step 1 — Pre-init: ensure `{username}/.claude` exists

The OrangeFS FUSE daemon exits silently when the `--subpath` target does not exist in the volume, leaving a stale FUSE mount point that returns `ENOTCONN` on every access. `{username}/.claude` is never pre-created by the server (only `{username}/{task_id}` is), so on a user's very first container start the path is missing.

To handle this, the entrypoint temporarily mounts `{username}` to a random temp directory, runs `mkdir -p .claude` inside it, then unmounts. This is idempotent — a no-op on subsequent starts once `.claude` exists.

```
/tmp/ofs-init-XXXXXX  ← temp mount of {username}/
    └── .claude/      ← created here if missing, then the temp mount is torn down
```

### Step 2 — Main mounts

Two `orangefs posix mount` FUSE daemons are started in the background:

```bash
orangefs posix mount \
  --rs-addr=...  --token=...  --volume-name=... \
  --subpath="{username}/.claude" \
  --mount-point="/root/.claude"

orangefs posix mount \
  --rs-addr=...  --token=...  --volume-name=... \
  --subpath="{username}/{task_id}" \
  --mount-point="/workspace/{username}/{task_id}"
```

### Step 3 — Readiness poll

The entrypoint blocks for up to 15 seconds (60 polls × 0.25 s) waiting for both mounts to become accessible. The check uses both `mountpoint -q` and `ls` — `mountpoint -q` alone is insufficient because a stale FUSE mount (daemon exited) satisfies it but returns `ENOTCONN` on any filesystem access.

## Separation of Concerns

| Concept | Where it lives |
|---|---|
| `TASK_ID` | Passed as env var; used only as the workspace path key `{username}/{task_id}` in OrangeFS |
| Claude session ID | Generated internally by Claude Code; stored in `.claude/projects/` JSONL filenames; never an env var |

These are independent. `TASK_ID` identifies the workspace on disk. The Claude session ID identifies a conversation thread within Claude Code. Multiple Claude sessions can share the same task workspace.

## Failure Modes

| Symptom | Cause | Effect |
|---|---|---|
| `Transport endpoint is not connected` on `/root/.claude` | FUSE daemon exited after mount (subpath missing on first boot) | Claude Code starts with ephemeral local `.claude` |
| `mountpoint -q` returns 0 but `ls` fails | Stale FUSE entry — daemon crashed after establishing the kernel mount | Entrypoint readiness check correctly reports failure |
| Temp mount (pre-init) times out | `{username}` subpath missing or OrangeFS unreachable | `.claude` pre-init is skipped with a warning; main mount will likely also fail |

## OrangeFS Binary

Installed at `/usr/local/bin/orangefs`. If absent, all mounts are skipped and the sandbox runs fully ephemeral.

Relevant command:

```
orangefs posix mount [options]
  --rs-addr       registry server address
  --token         auth token
  --volume-name   volume name
  --mount-point   local directory to mount into
  --subpath       mount a subdirectory of the volume as the filesystem root
```
