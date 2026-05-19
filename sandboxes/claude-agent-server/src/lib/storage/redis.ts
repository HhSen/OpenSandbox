import { Redis } from 'ioredis'

export function buildRedisClient(url: string): Redis {
  return new Redis(url)
}
