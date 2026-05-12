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
| `USERNAME` | Appended to the configured S3 prefix, e.g. `transcripts/{USERNAME}/…`, so each user's sessions are namespaced independently in the bucket |
| `CLAUDE_WRAPPER_CONFIG_FILE` | Override path to `config.json` |

## COMMANDS
```bash
cd sandboxes/claude-agent-server
npm install
npm run build
npm run dev

# Build Docker image (from repo root)
docker compose --profile sandbox-images build claude-agent-server
```
