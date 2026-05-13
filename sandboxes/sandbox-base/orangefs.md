# OrangeFS Usage in sandbox-base

## Overview

OrangeFS is a distributed POSIX filesystem used to persist agent workspace files across container restarts. The sandbox mounts one subpath from the OrangeFS volume into the container via FUSE.

## Mount Layout

```
OrangeFS volume
└── {username}/
    └── {task_id}/    → /workspace/{username}/{task_id}   (task workspace)
```

**Task workspace mount** (`{username}/{task_id}` → `/workspace/{username}/{task_id}`): task-specific working files for the agent. Pass the same `TASK_ID` to a new container to resume a previous task's workspace.

Session history and process metadata are written to OrangeFS by the agent server via the S3-compatible API (see `ORANGEFS_ENDPOINT`), not via the FUSE mount. The FUSE mount is exclusively for agent workspace artifacts.

## Environment Variables

| Variable | Description |
|---|---|
| `USERNAME` | User identifier. Must match `^[a-zA-Z0-9_-]+$`. Determines the user-level subpath in OrangeFS. |
| `TASK_ID` | Task identifier. Must match `^[a-zA-Z0-9_-]+$`. Determines the task-level subpath. Optional — omitting it skips the workspace mount. |
| `ORANGEFS_RS_ADDR` | Registry server address for FUSE mount (e.g. `10.14.127.65:8030`). |
| `ORANGEFS_TOKEN` | Authentication token for FUSE mount. |
| `ORANGEFS_VOLUME` | Volume name (e.g. `cozeloop`). |
| `ORANGEFS_ENDPOINT` | S3-compatible endpoint URL — used by the agent server to write session history. |
| `S3_ACCESS_KEY` | S3 access key for agent server session storage. |
| `S3_SECRET_KEY` | S3 secret key for agent server session storage. |

`USERNAME`, `TASK_ID`, `ORANGEFS_RS_ADDR`, `ORANGEFS_TOKEN`, and `ORANGEFS_VOLUME` must all be set for the workspace FUSE mount to be established. Omitting `USERNAME` (or if the binary is absent) skips the mount.

## How the Mount Is Established (entrypoint.sh)

A single `orangefs posix mount` FUSE daemon is started in the background:

```bash
orangefs posix mount \
  --rs-addr=...  --token=...  --volume-name=... \
  --subpath="{username}/{task_id}" \
  --mount-point="/workspace/{username}/{task_id}"
```

The entrypoint blocks for up to 15 seconds (60 polls × 0.25 s) waiting for the mount to become accessible. The check uses both `mountpoint -q` and `ls` — `mountpoint -q` alone is insufficient because a stale FUSE mount (daemon exited) satisfies it but returns `ENOTCONN` on any filesystem access.

## Separation of Concerns

| Concept | Where it lives |
|---|---|
| `TASK_ID` | Passed as env var; used as the workspace path key `{username}/{task_id}` in OrangeFS FUSE mount |
| Session history | Written by agent server via S3 API at `{username}/history/{encoded_cwd}/{session_id}/part-*.ndjson` |
| Session process record | Written by agent server via S3 API at `{username}/.claude/sessions/{pid}.json` |
| Claude session ID | Generated internally by the agent; stored in S3 history keys; never an env var |

`TASK_ID` identifies the workspace on disk. The Claude session ID identifies a conversation thread. Multiple Claude sessions can share the same task workspace.

## Failure Modes

| Symptom | Cause | Effect |
|---|---|---|
| `mountpoint -q` returns 0 but `ls` fails | Stale FUSE entry — daemon crashed after establishing the kernel mount | Entrypoint readiness check correctly reports failure |
| Workspace mount times out | `{username}/{task_id}` subpath missing or OrangeFS unreachable | Agent starts without persistent workspace |

## OrangeFS Binary

Installed at `/usr/local/bin/orangefs`. If absent, the mount is skipped and the sandbox runs fully ephemeral.

Relevant command:

```
orangefs posix mount [options]
  --rs-addr       registry server address
  --token         auth token
  --volume-name   volume name
  --mount-point   local directory to mount into
  --subpath       mount a subdirectory of the volume as the filesystem root
```
