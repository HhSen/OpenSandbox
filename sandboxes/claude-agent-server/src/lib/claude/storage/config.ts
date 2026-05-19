import { readFileSync } from 'node:fs'

import { z } from 'zod'

import { logger } from '../../logger.js'

const s3ConfigSchema = z.object({
  type: z.literal('s3'),
  bucket: z.string().min(1),
  prefix: z.string().optional(),
  region: z.string().default('us-east-1'),
  endpoint: z.string().url().optional(),
  forcePathStyle: z.boolean().optional(),
  credentials: z
    .object({
      accessKeyId: z.string().min(1),
      secretAccessKey: z.string().min(1),
    })
    .optional(),
})

const redisConfigSchema = z.object({
  type: z.literal('redis'),
  url: z.string().url(),
  prefix: z.string().optional(),
})

const startupConfigSchema = z.object({
  sessionStore: z.discriminatedUnion('type', [s3ConfigSchema, redisConfigSchema]).optional(),
  /**
   * Controls how aggressively transcript entries are flushed to the session store.
   * 'batched' (default): flush at end-of-turn.
   * 'eager': flush after every frame — near-real-time delivery, but one append() call per frame.
   */
  sessionStoreFlush: z.enum(['batched', 'eager']).optional(),
})

export type StartupConfig = z.infer<typeof startupConfigSchema>

function buildS3ConfigFromEnv(): z.infer<typeof s3ConfigSchema> | undefined {
  const endpoint = process.env['ORANGEFS_ENDPOINT']
  const bucket = process.env['ORANGEFS_VOLUME']
  const accessKeyId = process.env['S3_ACCESS_KEY']
  const secretAccessKey = process.env['S3_SECRET_KEY']

  const provided = { ORANGEFS_ENDPOINT: endpoint, ORANGEFS_VOLUME: bucket, S3_ACCESS_KEY: accessKeyId, S3_SECRET_KEY: secretAccessKey }
  const presentKeys = Object.entries(provided).filter(([, v]) => v).map(([k]) => k)
  const missingKeys = Object.entries(provided).filter(([, v]) => !v).map(([k]) => k)

  if (presentKeys.length === 0) {
    return undefined
  }

  if (missingKeys.length > 0) {
    throw new Error(`Incomplete S3 session store configuration — missing env vars: ${missingKeys.join(', ')}`)
  }

  const username = process.env['USERNAME']
  const prefix = username ? `${username}/history` : undefined

  return {
    type: 's3',
    bucket: bucket!,
    endpoint: endpoint!,
    forcePathStyle: true,
    region: 'us-east-1',
    ...(prefix !== undefined ? { prefix } : {}),
    credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
  }
}

function buildRedisConfigFromEnv(): z.infer<typeof redisConfigSchema> | undefined {
  const url = process.env['REDIS_URL']
  if (!url) return undefined

  const username = process.env['USERNAME']
  const prefix = username ? `${username}:history` : undefined

  return {
    type: 'redis',
    url,
    ...(prefix !== undefined ? { prefix } : {}),
  }
}

function loadConfigFile(): StartupConfig {
  const filePath = process.env['CLAUDE_AGENT_CONFIG_FILE'] ?? './config.json'
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }
    throw err
  }
  const parsed: unknown = JSON.parse(raw)
  return startupConfigSchema.parse(parsed)
}

export function loadStartupConfig(): StartupConfig {
  // Always read the file first so non-store settings (e.g. sessionStoreFlush) are
  // applied even when the store itself is configured via env vars.
  const fileCfg = loadConfigFile()

  const s3Config = buildS3ConfigFromEnv()
  if (s3Config) {
    logger.info(
      { bucket: s3Config.bucket, endpoint: s3Config.endpoint, prefix: s3Config.prefix },
      'session store: S3 config loaded from env vars',
    )
    return { ...fileCfg, sessionStore: s3Config }
  }

  const redisConfig = buildRedisConfigFromEnv()
  if (redisConfig) {
    logger.info(
      { url: redisConfig.url, prefix: redisConfig.prefix },
      'session store: Redis config loaded from env vars',
    )
    return { ...fileCfg, sessionStore: redisConfig }
  }

  if (fileCfg.sessionStore) {
    const { type } = fileCfg.sessionStore
    if (type === 's3') {
      logger.info(
        { bucket: fileCfg.sessionStore.bucket, prefix: fileCfg.sessionStore.prefix },
        'session store: S3 config loaded from config file',
      )
    } else {
      logger.info(
        { url: fileCfg.sessionStore.url, prefix: fileCfg.sessionStore.prefix },
        'session store: Redis config loaded from config file',
      )
    }
    return fileCfg
  }

  logger.info('session store: no configuration found, sessions will use local disk storage')
  return fileCfg
}
