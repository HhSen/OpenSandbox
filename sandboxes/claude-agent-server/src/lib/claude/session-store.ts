import { S3Client } from '@aws-sdk/client-s3'
import type { SessionStore } from '@anthropic-ai/claude-agent-sdk'
import type { StartupConfig } from '../startup-config.js'
import { S3SessionStore } from './S3SessionStore.js'

export function buildSessionStore(cfg: StartupConfig): SessionStore | undefined {
  const s3 = cfg.sessionStore
  if (!s3) {
    return undefined
  }

  // Append USERNAME so each user's sessions are namespaced independently,
  // mirroring the per-user isolation that was previously provided by the
  // OrangeFS mount ({USERNAME}/.claude → /root/.claude).
  const username = process.env['USERNAME']
  const effectivePrefix = [s3.prefix, username]
    .filter((s): s is string => Boolean(s))
    .join('/')

  const client = new S3Client({
    region: s3.region,
    ...(s3.endpoint !== undefined ? { endpoint: s3.endpoint } : {}),
    ...(s3.forcePathStyle !== undefined ? { forcePathStyle: s3.forcePathStyle } : {}),
    ...(s3.credentials !== undefined ? { credentials: s3.credentials } : {}),
  })

  return new S3SessionStore({
    bucket: s3.bucket,
    ...(effectivePrefix ? { prefix: effectivePrefix } : {}),
    client,
  })
}
