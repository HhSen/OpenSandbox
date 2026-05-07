#!/bin/bash
# SPDX-FileCopyrightText: 2025 Weibo, Inc.
#
# SPDX-License-Identifier: Apache-2.0

set -e

echo "[entrypoint] USERNAME=${USERNAME} SESSION_ID=${SESSION_ID}"

# Ensure Node.js is in PATH using the default version bundled in the base image
source /opt/opensandbox/code-interpreter-env.sh node

# --- OrangeFS: two-tier mount for Claude Code persistence ---
#
# Global (shared across all sessions for this user):
#   username/.claude/              → /root/.claude
#   Holds: settings, history, hooks, session transcripts — user-level Claude Code state.
#
# Session-specific (isolated per SESSION_ID):
#   username/session_id/workspace/ → /workspace
#   Holds: working files, artifacts, and the project-level /workspace/.claude/ config.
#
# Pass the same SESSION_ID to resume; use a new UUID for a fresh session.
if [ -x /usr/local/bin/orangefs ] && [ -n "${USERNAME:-}" ]; then

  # Validate to prevent path traversal via USERNAME or SESSION_ID
  if [[ ! "${USERNAME}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "[entrypoint] ERROR: USERNAME contains invalid characters — skipping OrangeFS mounts"
  elif [ -n "${SESSION_ID:-}" ] && [[ ! "${SESSION_ID}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "[entrypoint] ERROR: SESSION_ID contains invalid characters — skipping OrangeFS mounts"
  else
    mkdir -p /root/.claude

    echo "[entrypoint] mounting /root/.claude (global) from orangefs (${USERNAME}/.claude)..."
    nohup /usr/local/bin/orangefs posix mount \
      --rs-addr="${ORANGEFS_RS_ADDR:-}" \
      --token="${ORANGEFS_TOKEN:-}" \
      --volume-name="${ORANGEFS_VOLUME:-}" \
      --subpath="${USERNAME}/.claude" \
      --mount-point="/root/.claude" > /tmp/orangefs-claude.log 2>&1 &

    if [ -n "${SESSION_ID:-}" ]; then
      mkdir -p /workspace

      echo "[entrypoint] mounting /workspace (session) from orangefs (${USERNAME}/${SESSION_ID}/workspace)..."
      nohup /usr/local/bin/orangefs posix mount \
        --rs-addr="${ORANGEFS_RS_ADDR:-}" \
        --token="${ORANGEFS_TOKEN:-}" \
        --volume-name="${ORANGEFS_VOLUME:-}" \
        --subpath="${USERNAME}/${SESSION_ID}/workspace" \
        --mount-point="/workspace" > /tmp/orangefs-workspace.log 2>&1 &
    fi

    echo "[entrypoint] waiting for mounts to be ready..."
    MOUNT_TIMEOUT=30
    MOUNT_ELAPSED=0
    while true; do
      CLAUDE_UP=$(mountpoint -q /root/.claude && echo 1 || echo 0)
      if [ -z "${SESSION_ID:-}" ]; then
        WORKSPACE_UP=1
      else
        WORKSPACE_UP=$(mountpoint -q /workspace && echo 1 || echo 0)
      fi
      if [ "$CLAUDE_UP" = "1" ] && [ "$WORKSPACE_UP" = "1" ]; then break; fi
      if [ "$MOUNT_ELAPSED" -ge "$MOUNT_TIMEOUT" ]; then
        break
      fi
      sleep 1
      MOUNT_ELAPSED=$((MOUNT_ELAPSED + 1))
    done

    if mountpoint -q /root/.claude; then
      echo "[entrypoint] /root/.claude mounted successfully"
    else
      echo "[entrypoint] /root/.claude mount FAILED:"; cat /tmp/orangefs-claude.log
    fi

    if [ -n "${SESSION_ID:-}" ]; then
      if mountpoint -q /workspace; then
        echo "[entrypoint] /workspace mounted successfully"
      else
        echo "[entrypoint] /workspace mount FAILED:"; cat /tmp/orangefs-workspace.log
      fi
    fi
  fi
else
  echo "[entrypoint] skipping orangefs mounts — binary absent or USERNAME not set"
fi

# Bootstrap /root/.claude.json from ANTHROPIC_API_KEY when it doesn't exist.
# This file lives at $HOME, outside the /root/.claude mount, and is not persisted.
# Auth credentials are injected via env var in all sandbox deployments.
if [ -n "${ANTHROPIC_API_KEY:-}" ] && [ ! -f /root/.claude.json ]; then
  echo "[entrypoint] bootstrapping /root/.claude.json from ANTHROPIC_API_KEY"
  echo '{}' > /root/.claude.json
fi

echo "[entrypoint] starting claude-agent-server on port ${PORT:-3000}..."
exec node /app/dist/server.js
