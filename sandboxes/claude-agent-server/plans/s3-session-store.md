# Plan: S3 Session Store Integration

**Feature:** Wire `S3SessionStore` from the SDK reference example into `claude-agent-server`,
configured via a `config.json` file loaded at startup.

---

## Background

The SDK ships a reference `S3SessionStore` in
`ref/claude-agent-sdk/examples/session-stores/s3/src/S3SessionStore.ts`.
It already implements the full `SessionStore` contract (13-check conformance suite).
The server currently passes no `sessionStore` to `query()`, so sessions are mirrored
only to local disk under `~/.claude/`.

We have an S3-compatible file storage backend and want all session transcripts to
be durably mirrored there so they survive container restarts and are accessible across
instances.

---

## Config file approach

Rather than env vars, S3 connection parameters come from a **`config.json`** file
loaded once at startup. The server looks for it at a conventional path:

```
./config.json          (relative to process.cwd() — the default)
```

The path can be overridden with a single env var `CLAUDE_AGENT_CONFIG_FILE`
for cases where the working directory differs from the config location.
If the file is absent or `sessionStore` is omitted, the server starts as today
(local-disk only). Missing required fields inside a present `sessionStore` block
is a hard startup error.

### Schema

```jsonc
// config.json
{
  "sessionStore": {
    "type": "s3",
    "bucket": "my-claude-sessions",       // required
    "prefix": "transcripts",              // optional, default ""
    "region": "us-east-1",               // optional, default "us-east-1"
    "endpoint": "http://localhost:9000",  // optional — for S3-compatible stores (MinIO etc.)
    "forcePathStyle": true,              // optional — required for most S3-compatible endpoints
    "credentials": {                     // optional — omit to use SDK credential chain (IAM role, ~/.aws, etc.)
      "accessKeyId": "...",
      "secretAccessKey": "..."
    }
  }
}
```

---

## AWS S3 API operations used

The `S3SessionStore` uses exactly four S3 operations:

| Operation | SDK Command | Used in | IAM Action Required |
|---|---|---|---|
| `PutObject` | `PutObjectCommand` | `append()` — one part file per flush | `s3:PutObject` |
| `GetObject` | `GetObjectCommand` | `load()` — parallel fetch, 16 at a time | `s3:GetObject` |
| `ListObjectsV2` | `ListObjectsV2Command` | `load()`, `listSessions()`, `listSubkeys()` with `Prefix`, `Delimiter:'/'`, `ContinuationToken` pagination | `s3:ListBucket` |
| `DeleteObjects` | `DeleteObjectsCommand` | `delete()` — batch up to 1000 keys, `Quiet:true` | `s3:DeleteObject` |

**Key layout:**
```
s3://{bucket}/{prefix}{projectKey}/{sessionId}/part-{epochMs13}-{rand6}.jsonl
```
Subagent transcripts live one level deeper:
```
s3://{bucket}/{prefix}{projectKey}/{sessionId}/{subpath}/part-{epochMs13}-{rand6}.jsonl
```

**Minimum IAM policy:**
```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket", "s3:DeleteObject"],
  "Resource": [
    "arn:aws:s3:::my-claude-sessions",
    "arn:aws:s3:::my-claude-sessions/*"
  ]
}
```

---

## Files changed

### 1. `package.json`
Add production dependency:
```json
"@aws-sdk/client-s3": "^3.750.0"
```
(Same version pinned in the reference example.)

### 2. `src/lib/claude/S3SessionStore.ts` — new file (copy)
Copy verbatim from `ref/claude-agent-sdk/examples/session-stores/s3/src/S3SessionStore.ts`.
No changes needed — it imports only from `@aws-sdk/client-s3` and
`@anthropic-ai/claude-agent-sdk`, both already in the server.

### 3. `src/lib/startup-config.ts` — new file
Loads and validates `config.json` at startup. Returns a typed `StartupConfig` object.
Validates with Zod; throws on malformed input (hard startup error).

```typescript
// Sketch — not a full implementation
import { z } from 'zod'
import { readFileSync, existsSync } from 'node:fs'

const s3ConfigSchema = z.object({
  type: z.literal('s3'),
  bucket: z.string().min(1),
  prefix: z.string().optional(),
  region: z.string().default('us-east-1'),
  endpoint: z.string().url().optional(),
  forcePathStyle: z.boolean().optional(),
  credentials: z.object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
  }).optional(),
})

const startupConfigSchema = z.object({
  sessionStore: z.discriminatedUnion('type', [s3ConfigSchema]).optional(),
})

export type StartupConfig = z.infer<typeof startupConfigSchema>

export function loadStartupConfig(): StartupConfig {
  const path = process.env.CLAUDE_AGENT_CONFIG_FILE ?? './config.json'
  if (!existsSync(path)) return {}
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  return startupConfigSchema.parse(raw)
}
```

### 4. `src/lib/claude/session-store.ts` — new file
Constructs the `S3Client` and `S3SessionStore` singleton from `StartupConfig`.
Returns `SessionStore | undefined` — `undefined` when no store is configured.

```typescript
import { S3Client } from '@aws-sdk/client-s3'
import type { SessionStore } from '@anthropic-ai/claude-agent-sdk'
import type { StartupConfig } from '../startup-config.js'
import { S3SessionStore } from './S3SessionStore.js'

export function buildSessionStore(cfg: StartupConfig): SessionStore | undefined {
  const s3 = cfg.sessionStore
  if (!s3) return undefined

  const client = new S3Client({
    region: s3.region,
    ...(s3.endpoint !== undefined ? { endpoint: s3.endpoint } : {}),
    ...(s3.forcePathStyle !== undefined ? { forcePathStyle: s3.forcePathStyle } : {}),
    ...(s3.credentials !== undefined ? { credentials: s3.credentials } : {}),
  })

  return new S3SessionStore({
    bucket: s3.bucket,
    ...(s3.prefix !== undefined ? { prefix: s3.prefix } : {}),
    client,
  })
}
```

### 5. `src/lib/claude/session-service.ts` — pass `sessionStore` to `query()`
- Import `loadStartupConfig` and `buildSessionStore`.
- Construct the store once at module level (singleton):
  ```typescript
  const sessionStore = buildSessionStore(loadStartupConfig())
  ```
- In `execute()`, add to the `query()` options:
  ```typescript
  ...(sessionStore !== undefined ? { sessionStore } : {}),
  ```
  `queryOptionsSchema` does NOT change — `sessionStore` is a server-side singleton,
  not a per-request API option.

### 6. `CLAUDE.md` — update config section
Add a new **Config file** section documenting `config.json` and its schema.
Add `CLAUDE_AGENT_CONFIG_FILE` to the env var table as the sole env var for
config file path override.

---

## What does NOT change

- `sdk-schemas.ts` — `sessionStore` is never serialized over the HTTP API.
- All routes — transparent to callers.
- Existing env var config in `config.ts` — untouched; no migration needed.
- `S3SessionStore` logic — the reference code passes the full conformance suite as-is.

---

## Testing

### Unit (mock, no real S3)
Copy `ref/…/s3/test/S3SessionStore.test.ts` alongside into `tests/unit/`.
The mock client is self-contained — no live credentials needed.

### Live conformance (optional, env-gated)
Use MinIO for local S3-compatible testing:
```bash
docker run -d -p 9000:9000 minio/minio server /data
docker run --rm --network host minio/mc \
  sh -c 'mc alias set local http://localhost:9000 minioadmin minioadmin && mc mb local/test'

# config.json for test
cat > config.json <<'EOF'
{
  "sessionStore": {
    "type": "s3",
    "bucket": "test",
    "endpoint": "http://localhost:9000",
    "forcePathStyle": true,
    "credentials": { "accessKeyId": "minioadmin", "secretAccessKey": "minioadmin" }
  }
}
EOF

npm run dev
```

### Config-absent path
When `config.json` is missing or has no `sessionStore`, existing tests pass unchanged —
`sessionStore` is `undefined` and `execute()` calls `query()` without it.

---

## Open questions

- **Retention policy:** The SDK never deletes from the store unless `delete()` is called.
  Should we add S3 Lifecycle rules to the bucket, or a scheduled cleanup endpoint? Out of
  scope for this change; document in production checklist.
- **Clock skew:** Part-file ordering uses wall-clock ms. Multiple server instances with skew
  >1 s may produce out-of-order `load()` results. Acceptable for single-writer deployments;
  note in docs if multi-instance is expected.
