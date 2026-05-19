import type { SessionStore } from '@anthropic-ai/claude-agent-sdk'

import { buildRedisClient } from '../../storage/redis.js'
import { buildS3Client } from '../../storage/s3.js'
import type { StartupConfig } from './config.js'
import { RedisSessionStore } from './redis-session-store.js'
import { S3SessionStore } from './s3-session-store.js'

export function buildSessionStore(cfg: StartupConfig): SessionStore | undefined {
  const storeCfg = cfg.sessionStore
  if (!storeCfg) {
    return undefined
  }

  if (storeCfg.type === 'redis') {
    return new RedisSessionStore({
      client: buildRedisClient(storeCfg.url),
      ...(storeCfg.prefix ? { prefix: storeCfg.prefix } : {}),
    })
  }

  return new S3SessionStore({
    bucket: storeCfg.bucket,
    ...(storeCfg.prefix ? { prefix: storeCfg.prefix } : {}),
    client: buildS3Client(storeCfg),
  })
}
