# S3 Session Storage

The Claude Agent SDK can persist session transcripts to any S3-compatible object store instead of (or in addition to) the local filesystem. In the OpenSandbox deployment model, this replaces the OrangeFS FUSE mount at `/root/.claude`: the session store writes directly to the same bucket and subpath that OrangeFS would otherwise expose as a mounted directory.

---

## Why

By default, Claude Code keeps sessions on disk under `/root/.claude`. That directory is ephemeral — it vanishes when the container exits. The OrangeFS mount makes it durable by transparently proxying filesystem I/O to an S3 backend.

Using the S3 session store skips the FUSE layer entirely: the SDK writes session part-files directly to S3 through the AWS SDK. This avoids:

- mount race conditions at container startup
- FUSE daemon crashes causing `ENOTCONN` reads
- any latency added by the kernel FUSE path

Sessions survive sandbox restarts and can be resumed in a new container as long as the same env vars (and therefore the same bucket prefix) are supplied.

---

## How It Is Enabled

### Primary path — environment variables

Set all four storage env vars on sandbox creation. When the server starts and finds all four present it builds the S3 config automatically:

| Variable | Description |
|---|---|
| `ORANGEFS_ENDPOINT` | S3-compatible API endpoint (e.g. `https://s3-uspu.example.com`) |
| `ORANGEFS_VOLUME` | Bucket name |
| `S3_ACCESS_KEY` | Access key ID |
| `S3_SECRET_KEY` | Secret access key |
| `USERNAME` | Sandbox owner; used as the key prefix (`{USERNAME}/.claude`) |

`forcePathStyle` is automatically set to `true` (required by most S3-compatible stores). Region defaults to `us-east-1`.

These are the same variables that `entrypoint.sh` uses to mount OrangeFS FUSE paths. Supplying them makes both the FUSE mount and the session store point at the same bucket namespace, so each can serve as a fallback for the other.

### Fallback — `config.json`

When the env vars are absent (local dev, AWS IAM role deployments) the server reads `config.json` from the working directory:

```jsonc
{
  "sessionStore": {
    "type": "s3",
    "bucket": "my-claude-sessions",
    "prefix": "transcripts",           // optional, default ""
    "region": "us-east-1",             // optional, default "us-east-1"
    "endpoint": "http://localhost:9000",
    "forcePathStyle": true,
    "credentials": {
      "accessKeyId": "...",
      "secretAccessKey": "..."
    }
  }
}
```

Override the file path with `CLAUDE_WRAPPER_CONFIG_FILE=<path>`.

**Env vars always win.** If at least one of `ORANGEFS_ENDPOINT`, `ORANGEFS_VOLUME`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` is missing, the server falls back to `config.json`. If neither source is present, the server starts with local-disk storage only (no error).

---

## Creating a Sandbox with S3 Storage

Pass the storage env vars in the `env` field of the sandbox create request. The OpenSandbox lifecycle API (`POST /v1/sandboxes`) accepts arbitrary env vars that are injected verbatim into the container:

```http
POST /v1/sandboxes
Content-Type: application/json

{
  "image": "claude-agent-server:latest",
  "env": {
    "ANTHROPIC_API_KEY":   "sk-...",
    "ANTHROPIC_MODEL":     "claude-sonnet-4-6",

    "ORANGEFS_RS_ADDR":    "10.14.127.65:8030",
    "ORANGEFS_TOKEN":      "<ofs-token>",
    "ORANGEFS_VOLUME":     "cozeloop",
    "ORANGEFS_ENDPOINT":   "https://s3-uspu.example.com",

    "S3_ACCESS_KEY":       "AKDD...",
    "S3_SECRET_KEY":       "ASDD...",

    "USERNAME":            "alice",
    "TASK_ID":             "task-abc123"
  },
  "metadata": {
    "name": "alice-claude-agent"
  }
}
```

`USERNAME` scopes all session keys under `alice/.claude/…` in the bucket. `TASK_ID` is used by `entrypoint.sh` to mount the workspace path (`/workspace/alice/task-abc123`) but is not used by the session store itself.

### SDK example (TypeScript)

```typescript
import { SandboxApi, Configuration } from '@opensandbox/sdk'

const api = new SandboxApi(new Configuration({ basePath: 'http://localhost:8080/v1' }))

const sandbox = await api.createSandbox({
  createSandboxRequest: {
    image: 'claude-agent-server:latest',
    env: {
      ANTHROPIC_API_KEY:   process.env.ANTHROPIC_API_KEY!,
      ANTHROPIC_MODEL:     'claude-sonnet-4-6',
      ORANGEFS_ENDPOINT:   process.env.ORANGEFS_ENDPOINT!,
      ORANGEFS_VOLUME:     process.env.ORANGEFS_VOLUME!,
      S3_ACCESS_KEY:       process.env.S3_ACCESS_KEY!,
      S3_SECRET_KEY:       process.env.S3_SECRET_KEY!,
      USERNAME:            'alice',
      TASK_ID:             'task-abc123',
    },
  },
})
```

---

## Storage Layout

Every `append()` call writes one NDJSON part file. The key layout is:

```
{bucket}
└── {USERNAME}/.claude/
    └── {projectKey}/
        └── {sessionId}/
            ├── part-0000000000001-a3f9b2.jsonl   ← first turn
            ├── part-0000000000002-7c14e0.jsonl   ← second turn
            └── {subagentSubpath}/
                └── part-*.jsonl                  ← subagent transcript
```

- **`{USERNAME}/.claude/`** — mirrors the OrangeFS FUSE subpath mounted at `/root/.claude`
- **`{projectKey}`** — the Claude Code project identifier (typically the working directory path, hashed)
- **`{sessionId}`** — UUID assigned by the SDK on session creation
- **`part-{epochMs13}-{rand6}.jsonl`** — 13-digit millisecond timestamp for lexical-is-chronological ordering; 6-char random suffix avoids collisions across concurrent instances

Subagent transcripts live one level deeper under `{sessionId}/{subpath}/` so `load({projectKey, sessionId})` only returns the main transcript.

**Required IAM/ACL actions:** `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`, `s3:DeleteObject` on the bucket and its contents (`{bucket}/*`).

---

## Session Resume

To continue a session in a new sandbox, pass the same `USERNAME` (and therefore the same prefix) alongside the known `sessionId`:

```http
POST /sessions/{sessionId}/messages
Content-Type: application/json

{
  "prompt": "Continue where we left off",
  "stream": true
}
```

The SDK calls `load({projectKey, sessionId})` on the store, which lists and concatenates all part files, then resumes the conversation from the last known state. No warm-up or pre-seeding is needed — the store is the source of truth.

---

## Local Development with MinIO

Run a local S3-compatible store to test the integration without real S3 credentials:

```bash
# Start MinIO
docker run -d \
  -p 9000:9000 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  --name minio \
  minio/minio server /data

# Create the bucket
docker run --rm --network host minio/mc \
  sh -c 'mc alias set local http://localhost:9000 minioadmin minioadmin && mc mb local/dev-sessions'
```

Start the server with the matching env vars:

```bash
cd sandboxes/claude-agent-server

ORANGEFS_ENDPOINT=http://localhost:9000 \
ORANGEFS_VOLUME=dev-sessions \
S3_ACCESS_KEY=minioadmin \
S3_SECRET_KEY=minioadmin \
USERNAME=localdev \
npm run dev
```

Verify objects are being written:

```bash
docker run --rm --network host minio/mc \
  sh -c 'mc alias set local http://localhost:9000 minioadmin minioadmin && mc ls --recursive local/dev-sessions'
```

---

## Troubleshooting

**Server starts but sessions are not persisted to S3**

Check that all four required env vars are present and non-empty. The server logs a startup message if the session store is active — look for it in the container logs. If the vars are absent the server silently falls back to local disk.

**`NoSuchBucket` or `AccessDenied` errors**

- Verify the bucket exists before starting the server.
- Confirm `S3_ACCESS_KEY` / `S3_SECRET_KEY` have the required ACL actions on the bucket.
- For S3-compatible stores, confirm `forcePathStyle` is in effect (it is by default when using env-based config).

**OrangeFS mount and session store point at the same keys**

This is intentional in the standard deployment. Files written through the FUSE mount and objects written directly by the session store share the same `{USERNAME}/.claude/` prefix inside the bucket. If both are active simultaneously, writes from either path are visible from the other. Prefer the session store path (env vars present, FUSE mount can be skipped) for lower latency.
