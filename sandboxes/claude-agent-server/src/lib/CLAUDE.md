# src/lib — Shared Library

> Navigation: [Root](../../CLAUDE.md)

## Purpose

Infrastructure and service code used by the route layer. Two sub-areas: HTTP primitives and the Claude SDK wrapper. Also owns the top-level config singleton and logger.

## Directory Map

```
src/lib/
  config.ts          Env var parsing (Zod); exports the `config` singleton
  startup-config.ts  config.json loader; exports `loadStartupConfig()` and `StartupConfig`
  logger.ts          Pino logger singleton; re-exported for use throughout the app
  claude/            Claude SDK wrapper — sessions, runtime registry, message normalization
  http/              HTTP utilities — error classes, async handler, SSE helpers
```

## config.ts

Parses `process.env` at module load time using a Zod schema. Fails fast with a validation error if required env vars are missing or invalid. Exports a single `config` object — **the only source of runtime configuration**.

Imports `permissionModeSchema` and `settingSourceSchema` from `./claude/sdk-schemas.js`. This is the reason `sdk-schemas.ts` is kept as a dependency leaf (no local imports): `config.ts` runs at module load and must not pull in session-service or other heavy code.

## startup-config.ts

Loads infrastructure-level settings for the session store. Separate from `config.ts` because values may come from a file rather than standard env vars.

Priority order:
1. **Env vars** (`ORANGEFS_ENDPOINT` + `ORANGEFS_VOLUME` + `S3_ACCESS_KEY` + `S3_SECRET_KEY`): builds S3 config directly; uses `USERNAME` as the key prefix (`{USERNAME}/.claude`) to mirror the OrangeFS mount subpath in `entrypoint.sh`. `config.json` is not read.
2. **`config.json`** fallback: path `./config.json` (relative to `process.cwd()`), overridable with `CLAUDE_WRAPPER_CONFIG_FILE`. Throws a Zod validation error on malformed input — hard startup error. Returns `{}` when absent.

Consumed only by `claude/session-store.ts`; do not import elsewhere.

## logger.ts

Pino logger singleton. Import `logger` from here whenever you need to log — do not create new Pino instances elsewhere.

## Submodules

- [`claude/CLAUDE.md`](claude/CLAUDE.md) — SDK wrapper: session service, runtime registry, message normalizer, schema definitions
- [`http/CLAUDE.md`](http/CLAUDE.md) — HTTP utilities: error handling, SSE streaming helpers

## Scan Snapshot

- Date: 2026-04-20
- Files reviewed: config.ts, logger.ts
