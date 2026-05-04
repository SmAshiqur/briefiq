// Shared ioredis client.
//
// Used by:
//   - HealthController (PING for the readiness check)
//   - WorkersModule via BullMQ (queue + worker connections)
//
// We keep this thin — just the connection. Anything fancier (pub/sub, key
// helpers) goes in dedicated services so this stays mockable in tests.
//
// Pattern matches db/client.ts: factory + DI token + type alias.

import { Redis } from 'ioredis';
import { getEnv } from '../config/env';

export const REDIS_TOKEN = Symbol('REDIS_CLIENT');

/**
 * Build a fresh Redis client. Called once by RedisModule's provider so
 * the whole app shares one connection.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ for the blocking
 * `BRPOPLPUSH` it uses internally. We leave it null even on the health
 * client so we can share this same instance with workers later without
 * reconfiguring.
 */
export function createRedisClient(): Redis {
  const env = getEnv();
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    // Don't auto-reconnect forever — fail loudly so we notice.
    enableReadyCheck: true,
    // Reasonable startup wait. Local docker is up in <1s.
    connectTimeout: 5_000,
    // No noisy retry logs in dev.
    retryStrategy: (times) => Math.min(times * 200, 2_000),
  });
}

export type RedisClient = Redis;
