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

const startupConfigSchema = z.object({
  sessionStore: z.discriminatedUnion('type', [s3ConfigSchema]).optional(),
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

export function loadStartupConfig(): StartupConfig {
  const envConfig = buildS3ConfigFromEnv()
  if (envConfig) {
    logger.info(
      { bucket: envConfig.bucket, endpoint: envConfig.endpoint, prefix: envConfig.prefix },
      'session store: S3 config loaded from env vars',
    )
    return { sessionStore: envConfig }
  }

  logger.info('session store: no configuration found, sessions will use local disk storage')
  return {}
}
