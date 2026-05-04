// KeyRotator — picks the least-loaded healthy OpenRouter API key for each
// LLM call.
//
// Why we need this:
//   OpenRouter free tier limits are PER ACCOUNT:
//     - 20 requests / minute
//     - 200 requests / day  (1,000 if account has $10 credit deposited)
//   Stacking multiple free accounts therefore multiplies the effective
//   throughput at zero cost. The user supplies N keys via OPENROUTER_API_KEYS;
//   we rotate across them based on real-time usage and 429 cooldowns.
//
// Design choices:
//   - In-memory state. Single Node process is fine at prototype scale.
//     Same interface can be re-implemented on Redis when we go horizontal.
//   - Sliding-window minute counter. Each call records its timestamp; we
//     prune entries older than 60s when reading. No background timers.
//   - Hard daily reset at UTC midnight. Aligns with OpenRouter's quota day.
//   - Cooldown on 429: 5 minutes default, but the API can pass a Retry-After
//     hint that we honor instead.
//   - pick() returns the key with the lowest current minute-usage that is
//     NOT in cooldown. Ties broken by lowest day-usage. If all keys are in
//     cooldown, returns null and the caller decides what to do.

import { Injectable, Logger } from '@nestjs/common';

// ── Public types ──────────────────────────────────────────────────────────

export interface RotatorPick {
  /** The actual API key string to send to OpenRouter. */
  key: string;
  /** Stable id for logs / metrics — last 4 chars of the key. */
  keyId: string;
}

export interface KeySnapshot {
  keyId: string;
  usedThisMinute: number;
  usedToday: number;
  cooldownUntil: string | null; // ISO; null = available now
  lastError: string | null;
}

// ── Internals ─────────────────────────────────────────────────────────────

interface KeyState {
  key: string;
  keyId: string;
  /** Timestamps (ms) of every call in the last 60s. Pruned lazily. */
  recentCallsMs: number[];
  usedToday: number;
  cooldownUntil: Date | null;
  lastError: string | null;
}

// 5 minutes is a comfortable cooldown for OpenRouter free tier — enough that
// a 60s rate window has fully cleared and any flaky transient is gone.
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

// Free-tier per-key ceiling (200 unfunded / 1000 funded). We treat any key
// at this count as exhausted for the day to avoid wasting calls.
const SOFT_DAILY_CEILING = 1000;

@Injectable()
export class KeyRotator {
  private readonly logger = new Logger(KeyRotator.name);
  private readonly states = new Map<string, KeyState>();

  // Track when we last performed the daily reset. We do it lazily on each
  // pick() call rather than via a timer so tests can simulate time cleanly.
  private dailyResetAt: Date;

  constructor(keys: string[], private readonly clock: () => Date = () => new Date()) {
    if (keys.length === 0) {
      // Empty rotator is a programming error; misconfigured env should fail
      // at load time, not silently here.
      throw new Error('KeyRotator requires at least one API key');
    }
    for (const k of keys) {
      const trimmed = k.trim();
      if (!trimmed) continue;
      this.states.set(trimmed, this.fresh(trimmed));
    }
    this.dailyResetAt = this.startOfUtcDay(this.clock());
    this.logger.log(`KeyRotator initialised with ${this.states.size} key(s).`);
  }

  /** How many keys are configured (any state). */
  get size(): number {
    return this.states.size;
  }

  /**
   * Pick the next key to use. Returns null when every key is on cooldown.
   * Callers should treat null as "back off and try later" rather than
   * crashing.
   */
  pick(): RotatorPick | null {
    this.maybeDailyReset();

    const now = this.clock().getTime();
    const candidates: KeyState[] = [];

    for (const s of this.states.values()) {
      if (s.cooldownUntil && s.cooldownUntil.getTime() > now) continue;
      if (s.usedToday >= SOFT_DAILY_CEILING) continue;
      // Prune expired minute timestamps before comparing usage.
      this.pruneMinute(s, now);
      candidates.push(s);
    }

    if (candidates.length === 0) {
      return null;
    }

    // Lowest minute usage wins; ties broken by lowest day usage.
    candidates.sort((a, b) => {
      const aMin = a.recentCallsMs.length;
      const bMin = b.recentCallsMs.length;
      if (aMin !== bMin) return aMin - bMin;
      return a.usedToday - b.usedToday;
    });

    const chosen = candidates[0];
    return { key: chosen.key, keyId: chosen.keyId };
  }

  /** Record a successful call against `key`. Bumps minute + day counters. */
  markSuccess(key: string): void {
    const s = this.states.get(key);
    if (!s) return;
    const now = this.clock().getTime();
    s.recentCallsMs.push(now);
    s.usedToday += 1;
    s.lastError = null;
  }

  /**
   * Record a 429 (or quota) response. The key goes on cooldown for
   * `retryAfterMs` (default 5min). We still bump the day counter — it cost
   * us a slot on the upstream account whether or not the call succeeded.
   */
  markRateLimit(key: string, retryAfterMs: number = DEFAULT_COOLDOWN_MS): void {
    const s = this.states.get(key);
    if (!s) return;
    const cooldownUntil = new Date(this.clock().getTime() + retryAfterMs);
    s.cooldownUntil = cooldownUntil;
    s.usedToday += 1;
    s.lastError = `rate_limited until ${cooldownUntil.toISOString()}`;
    this.logger.warn(
      `Key ${s.keyId} on cooldown for ${Math.round(retryAfterMs / 1000)}s`,
    );
  }

  /**
   * Record a non-429 error (auth, network, model-down). We do NOT cooldown
   * — the LlmService cascade will simply move to the next model. We just
   * log the error against this key so observability surfaces it.
   */
  markError(key: string, err: Error): void {
    const s = this.states.get(key);
    if (!s) return;
    s.lastError = err.message.slice(0, 200);
  }

  /** Snapshot of every key's state. Used by /health for observability. */
  getSnapshot(): KeySnapshot[] {
    this.maybeDailyReset();
    const now = this.clock().getTime();
    return Array.from(this.states.values()).map((s) => {
      this.pruneMinute(s, now);
      return {
        keyId: s.keyId,
        usedThisMinute: s.recentCallsMs.length,
        usedToday: s.usedToday,
        cooldownUntil: s.cooldownUntil ? s.cooldownUntil.toISOString() : null,
        lastError: s.lastError,
      };
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private fresh(key: string): KeyState {
    return {
      key,
      // Last 4 chars are unique enough to identify a key in logs without
      // ever leaking the full secret.
      keyId: key.slice(-4),
      recentCallsMs: [],
      usedToday: 0,
      cooldownUntil: null,
      lastError: null,
    };
  }

  private pruneMinute(s: KeyState, nowMs: number): void {
    const cutoff = nowMs - 60_000;
    // Most calls land at the tail; binary search would be overkill.
    while (s.recentCallsMs.length > 0 && s.recentCallsMs[0] < cutoff) {
      s.recentCallsMs.shift();
    }
  }

  private maybeDailyReset(): void {
    const today = this.startOfUtcDay(this.clock());
    if (today.getTime() <= this.dailyResetAt.getTime()) return;

    for (const s of this.states.values()) {
      s.usedToday = 0;
      // Cooldowns from yesterday have almost certainly expired, but don't
      // assume — let pick() filter them based on real time.
    }
    this.dailyResetAt = today;
    this.logger.log('KeyRotator daily counters reset (UTC midnight).');
  }

  private startOfUtcDay(d: Date): Date {
    const out = new Date(d);
    out.setUTCHours(0, 0, 0, 0);
    return out;
  }
}
