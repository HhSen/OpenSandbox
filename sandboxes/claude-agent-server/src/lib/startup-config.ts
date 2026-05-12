import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'

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

// Build S3 session-store config from the same env vars used by entrypoint.sh
// to mount OrangeFS paths. When all four required vars are present the file-based
// config.json is skipped entirely, keeping credentials out of the image filesystem.
function buildS3ConfigFromEnv(): z.infer<typeof s3ConfigSchema> | undefined {
  const endpoint = process.env['ORANGEFS_ENDPOINT']
  const bucket = process.env['ORANGEFS_VOLUME']
  const accessKeyId = process.env['S3_ACCESS_KEY']
  const secretAccessKey = process.env['S3_SECRET_KEY']

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return undefined
  }

  // Mirror the subpath used by entrypoint.sh: {USERNAME}/.claude → /root/.claude
  const username = process.env['USERNAME']
  const prefix = username ? `${username}/.claude` : undefined

  return {
    type: 's3',
    bucket,
    endpoint,
    forcePathStyle: true,
    region: 'us-east-1',
    ...(prefix !== undefined ? { prefix } : {}),
    credentials: { accessKeyId, secretAccessKey },
  }
}

export function loadStartupConfig(): StartupConfig {
  // Env vars take precedence — no static credentials file needed at runtime.
  const envConfig = buildS3ConfigFromEnv()
  if (envConfig) {
    return { sessionStore: envConfig }
  }

  // Fall back to config.json for local dev / non-OrangeFS deployments.
  const path = process.env['CLAUDE_WRAPPER_CONFIG_FILE'] ?? './config.json'
  if (!existsSync(path)) {
    return {}
  }
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
  return startupConfigSchema.parse(raw)
}
