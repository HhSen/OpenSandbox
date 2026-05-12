#!/bin/bash
# SPDX-FileCopyrightText: 2025 Weibo, Inc.
#
# SPDX-License-Identifier: Apache-2.0

set -e

echo "[entrypoint] USERNAME=${USERNAME} TASK_ID=${TASK_ID}"

# Ensure Node.js is in PATH using the default version bundled in the base image
source /opt/opensandbox/code-interpreter-env.sh node

if [ -x /usr/local/bin/orangefs ] && [ -n "${USERNAME:-}" ]; then
  if [[ ! "${USERNAME}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "[entrypoint] ERROR: USERNAME contains invalid characters — skipping OrangeFS mounts"
  elif [ -n "${TASK_ID:-}" ] && [[ ! "${TASK_ID}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "[entrypoint] ERROR: TASK_ID contains invalid characters — skipping OrangeFS mounts"
  else
    if [ -n "${TASK_ID:-}" ]; then
      WORKSPACE_TASK_DIR="/workspace/${USERNAME}/${TASK_ID}"
      mkdir -p "${WORKSPACE_TASK_DIR}"
      echo "[entrypoint] mounting ${USERNAME}/${TASK_ID} → ${WORKSPACE_TASK_DIR}"
      nohup /usr/local/bin/orangefs posix mount \
        --rs-addr="${ORANGEFS_RS_ADDR:-}" \
        --token="${ORANGEFS_TOKEN:-}" \
        --volume-name="${ORANGEFS_VOLUME:-}" \
        --subpath="${USERNAME}/${TASK_ID}" \
        --mount-point="${WORKSPACE_TASK_DIR}" > /tmp/orangefs.log 2>&1 &
      _ws_pid=$!

      # Block until workspace mount is ready (or timeout). Poll fast for low latency.
      # Use `ls` in addition to `mountpoint -q` — a crashed FUSE daemon leaves a stale
      # mount entry that satisfies mountpoint but returns ENOTCONN on any access.
      for _ in $(seq 1 60); do
        mountpoint -q "${WORKSPACE_TASK_DIR}" && ls "${WORKSPACE_TASK_DIR}" > /dev/null 2>&1 && WS=1 || WS=0
        [ "$WS" = "1" ] && break
        sleep 0.25
      done

      echo "[entrypoint] orangefs status: workspace=${WS}"
      if [ "$WS" != "1" ]; then
        kill -0 "$_ws_pid" 2>/dev/null && _alive=yes || _alive=no
        echo "[entrypoint] workspace mount failed (daemon alive: ${_alive})"
        cat /tmp/orangefs.log
      fi
      unset _ws_pid _alive
    fi
  fi
else
  echo "[entrypoint] skipping orangefs mounts — binary absent or USERNAME not set"
fi

# Bootstrap /root/.claude.json from ANTHROPIC_API_KEY when it doesn't exist.
if [ -n "${ANTHROPIC_API_KEY:-}" ] && [ ! -f /root/.claude.json ]; then
  echo '{}' > /root/.claude.json
fi

echo "[entrypoint] starting claude-agent-server on port ${PORT:-3000}..."
exec node /app/dist/server.js
