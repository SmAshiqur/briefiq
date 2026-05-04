// /health — liveness + readiness in one endpoint.
//
// Used by:
//   - Fly.io / load balancers as a liveness probe
//   - The iOS app's Settings screen "API reachable" indicator
//   - You, when you want to verify the server actually started
//
// Behavior:
//   - DB unreachable     -> 503 (the API can't serve data without it)
//   - Redis unreachable  -> 200 + warn flag (reads still work; workers don't)
//   - All LLM keys cool  -> 200 + warn flag (cached data still served)
//
// The body always includes a structured `checks` object so dashboards
// and humans can drill into which subsystem is unhappy.

import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE_TOKEN, type DrizzleDb } from './db/client';
import { REDIS_TOKEN, type RedisClient } from './redis/client';
import { KeyRotator } from './services/key-rotator';

interface SubsystemCheck {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDb,
    @Inject(REDIS_TOKEN) private readonly redis: RedisClient,
    private readonly keyRotator: KeyRotator,
  ) {}

  @Get()
  async check() {
    // Run DB and Redis checks in parallel — they're independent.
    const [dbCheck, redisCheck] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
    ]);

    const llmSummary = this.summarizeLlmKeys();

    const body = {
      ok: dbCheck.ok, // DB is the only blocker for "alive"
      service: 'briefiq-api',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      checks: {
        db: dbCheck,
        redis: redisCheck,
        llm: llmSummary,
      },
    };

    // 503 only on DB failure — that's the one subsystem the request path
    // depends on. Workers and LLM degrade gracefully without breaking GET.
    if (!dbCheck.ok) {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return body;
  }

  // ── Private checks ─────────────────────────────────────────────────────

  private async checkDb(): Promise<SubsystemCheck> {
    const start = Date.now();
    try {
      // SELECT 1 is the universal "is the DB alive" ping. Drizzle's
      // execute() goes straight to the underlying client — no schema parse.
      await this.db.execute(sql`SELECT 1`);
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.error(`DB ping failed: ${(err as Error).message}`);
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }

  private async checkRedis(): Promise<SubsystemCheck> {
    const start = Date.now();
    try {
      // ioredis exposes ping(); returns 'PONG' on success.
      const reply = await this.redis.ping();
      const ok = reply === 'PONG';
      return ok
        ? { ok: true, latencyMs: Date.now() - start }
        : { ok: false, error: `unexpected reply: ${reply}` };
    } catch (err) {
      this.logger.warn(`Redis ping failed: ${(err as Error).message}`);
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }

  /**
   * LLM key health — never blocks readiness, but surfaces useful metrics.
   * Returns the count of available vs cooling keys plus per-key day usage.
   * Raw key strings are NEVER returned (KeyRotator.getSnapshot uses keyId).
   */
  private summarizeLlmKeys() {
    const snap = this.keyRotator.getSnapshot();
    const now = Date.now();
    const available = snap.filter(
      (k) => !k.cooldownUntil || new Date(k.cooldownUntil).getTime() <= now,
    ).length;
    const coolingDown = snap.length - available;
    return {
      configured: snap.length,
      available,
      coolingDown,
      keys: snap, // already redacted (only keyId, not the secret)
    };
  }
}
