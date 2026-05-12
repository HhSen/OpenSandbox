# sandboxes/claude-agent-server — Claude Agent HTTP Server

**Generated:** 2026-04-28 | **Branch:** dev | **Commit:** 451c346

## OVERVIEW
TypeScript/Node.js HTTP server image deployed inside sandbox containers to expose Claude streaming sessions via SSE. Consumed by the `console/` web UI's chat panel. Has its own OpenAPI spec hierarchy (`openspec/`).

## STRUCTURE
```
sandboxes/claude-agent-server/
├── src/
│   ├── app.ts         # Express app setup
│   ├── server.ts      # HTTP server entry
│   ├── lib/
│   │   ├── claude/    # Claude SDK wrapper (streaming, tool-use)
│   │   └── http/      # SSE helpers and middleware
│   └── routes/        # Route handlers
├── openspec/          # Local OpenAPI spec + change proposals
│   ├── specs/         # Current spec
│   └── changes/       # Archived spec evolution proposals
├── ref/
│   └── claude-agent-sdk/  # Reference SDK (30 files — do not edit)
├── tests/
│   └── lib/
│       ├── claude/    # Claude integration tests
│       └── http/      # HTTP/SSE tests
└── docs/              # Design docs
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| SSE streaming protocol | `src/lib/http/` + `src/routes/` |
| Claude API integration | `src/lib/claude/` |
| Server spec | `openspec/specs/` |
| Reference implementation | `ref/claude-agent-sdk/` (read-only) |

## CONVENTIONS
- Has **multiple local CLAUDE.md files** (`src/lib/CLAUDE.md`, `src/lib/claude/CLAUDE.md`, `src/lib/http/CLAUDE.md`, `src/routes/CLAUDE.md`) — check them before editing sub-areas
- `ref/claude-agent-sdk/` is a read-only reference copy — never edit it directly
- `openspec/changes/` archives spec evolution proposals (OSEP-style for this component)
- CI: built as Docker image via `docker compose --profile sandbox-images build`

## ANTI-PATTERNS
- Do not edit `ref/claude-agent-sdk/` — it is a reference snapshot
- Do not expose this server directly on a public port without the ingress gateway

## CONFIG FILE

The server optionally reads a **`config.json`** file from the working directory at startup. Use it for infrastructure-level settings that are fixed per deployment (not per-request).

Path resolution: `./config.json` (relative to `process.cwd()`). Override with the `CLAUDE_WRAPPER_CONFIG_FILE` env var.

If the file is absent or has no `sessionStore` key, the server starts normally with local-disk session storage only. A present but malformed `sessionStore` block is a **hard startup error**.

### Session store (S3 / S3-compatible)

```jsonc
// config.json
{
  "sessionStore": {
    "type": "s3",
    "bucket": "my-claude-sessions",       // required
    "prefix": "transcripts",              // optional, default ""
    "region": "us-east-1",               // optional, default "us-east-1"
    "endpoint": "http://localhost:9000",  // optional — for MinIO / S3-compatible stores
    "forcePathStyle": true,              // optional — required for most S3-compatible endpoints
    "credentials": {                     // optional — omit to use SDK credential chain (IAM role, ~/.aws, etc.)
      "accessKeyId": "...",
      "secretAccessKey": "..."
    }
  }
}
```

### Env vars

| Variable | Purpose |
|---|---|
| `ANTHROPIC_MODEL` | Default model for all sessions (short alias; `CLAUDE_WRAPPER_DEFAULT_MODEL` takes precedence if both are set) |
| `CLAUDE_WRAPPER_DEFAULT_MODEL` | Default model for all sessions (overrides `ANTHROPIC_MODEL`) |
| `CLAUDE_WRAPPER_DEFAULT_PERMISSION_MODE` | Default permission mode (`default`, `acceptEdits`, `autoEdit`, `bypassPermissions`) — default: `default` |
| `CLAUDE_WRAPPER_DEFAULT_SETTING_SOURCES` | Comma-separated setting sources — default: `project,user,local` |
| `CLAUDE_WRAPPER_REQUIRE_AUTH_TOKEN` | If set, all requests must supply this token as a Bearer token |
| `CLAUDE_CODE_EXECUTABLE` | Absolute path to the `claude` binary. Required when Claude Code is installed via the native installer and the SDK cannot find a bundled binary via npm optional dependencies |
| `PORT` | HTTP listen port — default: `3000` |
| `HOST` | HTTP listen host — default: `0.0.0.0` |
| `LOG_LEVEL` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) — default: `info` |
| `USERNAME` | Appended to the S3 prefix as `{USERNAME}/.claude` to namespace sessions per user |
| `ORANGEFS_ENDPOINT` | S3-compatible endpoint URL for the session store (e.g. OrangeFS / MinIO) |
| `ORANGEFS_VOLUME` | S3 bucket name for the session store |
| `S3_ACCESS_KEY` | S3 access key ID |
| `S3_SECRET_KEY` | S3 secret access key |
| `CLAUDE_WRAPPER_CONFIG_FILE` | Override path to `config.json` (default: `./config.json`) |

## COMMANDS
```bash
cd sandboxes/claude-agent-server
npm install
npm run build
npm run dev

# Build Docker image (from repo root)
docker compose --profile sandbox-images build claude-agent-server
```
