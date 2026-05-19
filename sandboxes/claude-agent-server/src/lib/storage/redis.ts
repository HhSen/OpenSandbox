import { Redis } from 'ioredis'

import { logger } from '../logger.js'

export function buildRedisClient(url: string): Redis {
  const client = new Redis(url)
  // ioredis emits 'error' events on connection failures; without a listener Node crashes.
  client.on('error', err => logger.error({ err }, 'redis client error'))
  return client
}
