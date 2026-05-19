import { S3Client } from '@aws-sdk/client-s3'

export type S3ClientOptions = {
  region: string
  endpoint?: string | undefined
  forcePathStyle?: boolean | undefined
  credentials?: { accessKeyId: string; secretAccessKey: string } | undefined
}

export function buildS3Client(opts: S3ClientOptions): S3Client {
  return new S3Client({
    region: opts.region,
    ...(opts.endpoint !== undefined ? { endpoint: opts.endpoint } : {}),
    ...(opts.forcePathStyle !== undefined ? { forcePathStyle: opts.forcePathStyle } : {}),
    ...(opts.credentials !== undefined ? { credentials: opts.credentials } : {}),
  })
}
