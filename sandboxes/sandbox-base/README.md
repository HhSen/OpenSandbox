# OpenSandbox Sandbox Base Image

The `sandbox-base` image is the default runtime for OpenSandbox Claude Code sandboxes. It bundles:

- **Claude Code CLI** (`@anthropic-ai/claude-code`) — pre-installed, ready to use
- **Code interpreter** — Python 3.10–3.14, Node.js 18/20/22, multi-version toolchain (see [code-interpreter](../code-interpreter/README.md))
- **claude-agent-server** — HTTP API server at port 3000 for driving Claude Code sessions via REST/SSE
- **OrangeFS client** — optional distributed filesystem for workspace persistence

## Environment Variables

### Core

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Recommended | Anthropic API key. If set and `/root/.claude.json` does not yet exist, the entrypoint creates an empty config so Claude Code's first-run auth picks up the key automatically. |

### Workspace Persistence (OrangeFS)

These variables enable two-tier persistence via OrangeFS. `USERNAME` alone enables global config persistence; both `USERNAME` and `SESSION_ID` are required for session workspace persistence.

| Variable | Description |
|---|---|
| `USERNAME` | User identifier. Must match `^[a-zA-Z0-9_-]+$`. Determines the user-level subpath in OrangeFS. |
| `SESSION_ID` | Session identifier. Must match `^[a-zA-Z0-9_-]+$`. Pass a new UUID for a fresh session; reuse the same value to resume. |
| `ORANGEFS_RS_ADDR` | OrangeFS registry server address. |
| `ORANGEFS_TOKEN` | OrangeFS authentication token. |
| `ORANGEFS_VOLUME` | OrangeFS volume name. |

## Persistence Architecture

```
OrangeFS volume/
  {USERNAME}/
    .claude/                        ← global user config (shared across all sessions)
      settings.json                 ← Claude Code settings
      CLAUDE.md                     ← global instructions
      history.jsonl                 ← command history
      hooks/                        ← hook scripts
      projects/                     ← conversation histories (all sessions)
    {SESSION_ID}/
      workspace/                    ← session working files and artifacts
        .claude/                    ← project-level Claude Code config (CLAUDE.md, local settings)
        <your files>

Container mounts:
  /root/.claude/   ← OrangeFS: {USERNAME}/.claude/      (global, shared)
  /workspace/      ← OrangeFS: {USERNAME}/{SESSION_ID}/workspace/  (session-specific)
  /root/.claude.json  ← bootstrapped from ANTHROPIC_API_KEY (not persisted)
```

## Fallback Behaviour

All persistence variables are optional. The table below shows what is lost and what still works when each is omitted.

| What is omitted | Effect |
|---|---|
| None omitted (full config) | Full persistence: Claude Code config, workspace files, and conversation history all survive container destruction. |
| `SESSION_ID` not set | Global Claude Code config (`/root/.claude`) persists via OrangeFS; `/workspace` is ephemeral inside the container. |
| `USERNAME` not set (or OrangeFS binary absent) | Both mounts skipped. All state is ephemeral. |
| `ANTHROPIC_API_KEY` not set and no persisted config | Claude Code runs but prompts for interactive login on first use. |
| All omitted | Fully ephemeral: works for one-off tasks, nothing persists. |

## Creating a Sandbox with Full Persistence

The following example shows a complete `CreateSandboxRequest` body using the OpenSandbox lifecycle API.

```json
{
  "image": {
    "uri": "opensandbox/sandbox-base:latest"
  },
  "timeout": 3600,
  "env": {
    "ANTHROPIC_API_KEY": "<your-anthropic-api-key>",
    "USERNAME": "<user-id>",
    "SESSION_ID": "<session-id>",
    "ORANGEFS_RS_ADDR": "<orangefs-registry-addr>",
    "ORANGEFS_TOKEN": "<orangefs-token>",
    "ORANGEFS_VOLUME": "<orangefs-volume>"
  },
  "entrypoint": ["/entrypoint.sh"]
}
```

### Python SDK example

```python
from opensandbox import Sandbox

sandbox = await Sandbox.create(
    image="opensandbox/sandbox-base:latest",
    connection_config=config,
    env={
        "ANTHROPIC_API_KEY": anthropic_api_key,
        "USERNAME": user_id,
        "SESSION_ID": session_id,
        "ORANGEFS_RS_ADDR": orangefs_addr,
        "ORANGEFS_TOKEN": orangefs_token,
        "ORANGEFS_VOLUME": orangefs_volume,
    },
    entrypoint=["/entrypoint.sh"],
)
```

To resume a previous session, create a new sandbox with the **same `SESSION_ID`**. Claude Code will see the prior workspace files and its full conversation history.

### Minimal (no persistence)

If you only need a one-shot sandbox with no state carried over between runs, no OrangeFS config is required:

```json
{
  "image": { "uri": "opensandbox/sandbox-base:latest" },
  "timeout": 3600,
  "env": {
    "ANTHROPIC_API_KEY": "<your-anthropic-api-key>"
  },
  "entrypoint": ["/entrypoint.sh"]
}
```

Claude Code will authenticate from `ANTHROPIC_API_KEY` on first run. All state is discarded when the container exits.

## Port

The claude-agent-server listens on port **3000** by default. Override with `PORT`.
