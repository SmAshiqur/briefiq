// LLM gateway service.
//
// Single entrypoint for every structured-output prompt the app needs. Built
// on Vercel AI SDK + Zod + OpenRouter. The pattern lets us swap free
// auto-router for paid Claude/GPT by changing one env var — never code.
//
// Public methods today:
//   understandQuery(text)        — query understanding (Add Query screen)
//   summarizeDelta(delta, ...)   — briefing summary (after delta detected)
//
// Add new ones by following .cursor/skills/add-llm-prompt/SKILL.md.
//
// ── Multi-key rotation ──
// Each call walks (free model cascade) × (key rotator) until one combo
// succeeds. 429s cooldown the offending key (5min default) and we keep
// going with the next key. When every free combo is exhausted, an
// optional paid fallback fires as a last resort. Free-only deployments
// leave the paid env vars blank, and exhaustion throws LlmExhaustedError
// which the worker catches and degrades to "no fresh briefing this cycle".

import { Injectable, Logger } from '@nestjs/common';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  getEnv,
  getFreeModelCascade,
  getPaidLlmConfig,
  type PaidLlmConfig,
} from '../config/env';
import { KeyRotator } from './key-rotator';

// ── Schemas ──────────────────────────────────────────────────────────────

// Mirrors the iOS prototype's Confirm panel. .describe() lines double as
// LLM field hints so the model knows what each slot means.
export const QueryUnderstanding = z.object({
  intent: z
    .enum(['trend', 'event', 'policy', 'listing', 'price', 'other'])
    .describe('The shape of update the user is asking us to track.'),
  signal_definition: z
    .string()
    .describe(
      'One sentence describing what counts as a meaningful change. ' +
        'Used by the delta detector and shown to the user as confirmation.',
    ),
  suggested_sources: z
    .array(z.string())
    .max(5)
    .describe('Up to 5 credible source domains, ranked by relevance.'),
  suggested_frequency: z
    .enum(['hourly', 'daily', 'weekly'])
    .describe(
      'How often the system should re-check. Daily is the safe default ' +
        'when you are unsure.',
    ),
});
export type QueryUnderstanding = z.infer<typeof QueryUnderstanding>;

export const DeltaSummary = z.object({
  importance: z
    .enum(['important', 'new', 'minor'])
    .describe(
      "'important' = time-sensitive, push immediately. " +
        "'new' = informational, normal push. " +
        "'minor' = digest-only.",
    ),
  summary: z
    .string()
    .max(280)
    .describe('Two short sentences max. The text shown on the feed card.'),
});
export type DeltaSummary = z.infer<typeof DeltaSummary>;

// ── Prompts ──────────────────────────────────────────────────────────────

// Prompts sit at the top of the file. Edit them in PRs, not at runtime.
const UNDERSTAND_QUERY_PROMPT = `You analyze natural-language tracking queries from a user.
Identify intent, define what counts as a meaningful change, suggest credible
sources, and pick a check frequency.

Default to "daily" frequency unless the topic is clearly volatile (currencies,
breaking events) or clearly slow-moving (annual policy, university admissions).

EXAMPLE
Input: "Track dollar rate in Bangladesh"
Output: {
  intent: "trend",
  signal_definition: "Notify on rate change > 1 BDT or material policy news",
  suggested_sources: ["Bangladesh Bank", "The Daily Star", "Reuters"],
  suggested_frequency: "daily"
}

EXAMPLE
Input: "Any new BUET admission updates this week?"
Output: {
  intent: "event",
  signal_definition: "Notify on new circular, deadline change, or result publication",
  suggested_sources: ["BUET Admissions Office"],
  suggested_frequency: "weekly"
}`;

const SUMMARIZE_DELTA_PROMPT = `You write a 2-sentence briefing summary describing a meaningful change.

Voice: a calm, expert researcher. No hype, no emojis, no exclamation marks.
Be specific. Quote numbers, dates, source names where present.

Importance rubric:
- "important": affects user decisions today (rate spike, deadline, policy change)
- "new":       genuine new info, not urgent (new listing, scheduled update)
- "minor":     small change, only worth bundling into a daily digest`;

// ── Types & errors ───────────────────────────────────────────────────────

/**
 * Thrown when every free key+model combo has failed AND the paid fallback
 * is either unavailable or also failed. Catch this at the worker level
 * and log; do not bubble to the user.
 */
export class LlmExhaustedError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'LlmExhaustedError';
  }
}

// The shape of a configured router (Vercel AI SDK provider).
type Router = ReturnType<typeof createOpenAI>;

// Function signature for a single LLM attempt. Receives an already-built
// router and a model name; returns the typed result.
type LlmAttempt<T> = (router: Router, modelName: string) => Promise<T>;

// ── Service ──────────────────────────────────────────────────────────────

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  // One Vercel AI SDK provider per (apiKey, baseURL) pair. Built lazily and
  // cached so we don't re-instantiate on every call.
  private readonly routerCache = new Map<string, Router>();

  constructor(private readonly keyRotator: KeyRotator) {}

  /**
   * Run query understanding on a freshly submitted user query. Powers the
   * "Analyze with AI →" panel on the iOS Add Query screen.
   */
  async understandQuery(text: string): Promise<QueryUnderstanding> {
    return this.runWithFallback(async (router, modelName) => {
      const { object } = await generateObject({
        model: router(modelName),
        schema: QueryUnderstanding,
        system: UNDERSTAND_QUERY_PROMPT,
        prompt: text,
      });
      return object;
    });
  }

  /**
   * Generate a 2-sentence briefing summary + importance from a structured
   * delta verdict. Called after the hybrid delta detector says "yes,
   * something changed".
   */
  async summarizeDelta(input: {
    queryText: string;
    deltaVerdict: string;
    facts: unknown;
  }): Promise<DeltaSummary> {
    return this.runWithFallback(async (router, modelName) => {
      const { object } = await generateObject({
        model: router(modelName),
        schema: DeltaSummary,
        system: SUMMARIZE_DELTA_PROMPT,
        prompt: [
          `User question: "${input.queryText}"`,
          `Delta verdict: ${input.deltaVerdict}`,
          `Structured facts: ${JSON.stringify(input.facts).slice(0, 1500)}`,
        ].join('\n\n'),
      });
      return object;
    });
  }

  // ── Private: cascade orchestrator ─────────────────────────────────────

  /**
   * Runs an LLM call with the full free-cascade + paid-fallback strategy.
   *
   * Order of attempts:
   *   for each model in [LLM_MODEL, ...LLM_FREE_CASCADE]:
   *     for each available key from KeyRotator (size=N keys):
   *       try the call once
   *       on 429    -> cooldown that key, try next key on same model
   *       on other  -> log, break to next model entirely
   *       on ok     -> markSuccess, return
   *   if all free combos failed and PAID_LLM_* is set:
   *     try paid model once
   *   else throw LlmExhaustedError
   *
   * No exponential backoff inside this method — the rotator's per-key
   * cooldown does the work of "wait before retrying that combo".
   */
  private async runWithFallback<T>(fn: LlmAttempt<T>): Promise<T> {
    const env = getEnv();
    const models = [env.LLM_MODEL, ...getFreeModelCascade()].filter(
      // dedupe in case LLM_MODEL is also listed in the cascade
      (v, i, a) => a.indexOf(v) === i,
    );

    let lastErr: unknown = null;

    // ── Free path ──
    for (const model of models) {
      const maxKeyTries = Math.max(1, this.keyRotator.size);

      for (let i = 0; i < maxKeyTries; i++) {
        const pick = this.keyRotator.pick();
        if (!pick) {
          // Every key is on cooldown. No point cycling models — they all
          // need a key. Break out and try the paid fallback.
          this.logger.warn(
            `All ${this.keyRotator.size} key(s) on cooldown; ` +
              'breaking to paid fallback.',
          );
          return this.tryPaidFallback(fn, lastErr);
        }

        try {
          const router = this.getRouter(pick.key, env.LLM_BASE_URL);
          const t0 = Date.now();
          this.logger.log(`LLM call model=${model} key=${pick.keyId}`);
          const result = await fn(router, model);
          this.keyRotator.markSuccess(pick.key);
          this.logger.log(`LLM ok model=${model} key=${pick.keyId} +${Date.now() - t0}ms`);
          return result;
        } catch (err) {
          lastErr = err;

          if (this.isRateLimit(err)) {
            const retryAfter = this.parseRetryAfterMs(err);
            this.keyRotator.markRateLimit(pick.key, retryAfter);
            // Same model, next key.
            continue;
          }

          // Non-429 errors (model down, auth, malformed schema response).
          // Same model on a different key would just fail the same way,
          // so jump straight to the next model.
          this.keyRotator.markError(pick.key, err as Error);
          this.logger.warn(
            `LLM call failed on model=${model} key=${pick.keyId}: ` +
              `${(err as Error).message}. Cascading to next model.`,
          );
          break;
        }
      }
    }

    // ── Paid fallback ──
    return this.tryPaidFallback(fn, lastErr);
  }

  /**
   * Try the paid model once, if configured. Throws LlmExhaustedError when
   * paid is not configured or also fails. Returns the value on success.
   */
  private async tryPaidFallback<T>(
    fn: LlmAttempt<T>,
    lastErr: unknown,
  ): Promise<T> {
    const paid = getPaidLlmConfig();
    if (!paid) {
      throw new LlmExhaustedError(
        'All free-tier keys/models exhausted; paid fallback not configured.',
        lastErr instanceof Error ? lastErr : undefined,
      );
    }

    try {
      const router = this.getRouter(paid.apiKey, paid.baseUrl);
      this.logger.warn(
        `Free-tier exhausted. Falling back to paid model ${paid.model}.`,
      );
      return await fn(router, paid.model);
    } catch (err) {
      this.logger.error(
        `Paid fallback also failed: ${(err as Error).message}`,
      );
      throw new LlmExhaustedError(
        'Free-tier exhausted; paid fallback also failed.',
        err instanceof Error ? err : undefined,
      );
    }
  }

  /**
   * Build (or reuse) a Vercel AI SDK provider for a given (apiKey, baseUrl)
   * pair. Cached by apiKey since most calls share the same baseUrl.
   */
  private getRouter(apiKey: string, baseURL: string): Router {
    const cached = this.routerCache.get(apiKey);
    if (cached) return cached;
    const router = createOpenAI({ baseURL, apiKey });
    this.routerCache.set(apiKey, router);
    return router;
  }

  // ── Error sniffing helpers ──────────────────────────────────────────

  private isRateLimit(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    const msg = String(
      (err as { message?: unknown }).message ?? '',
    ).toLowerCase();
    const status = (err as { status?: number; statusCode?: number }).status
      ?? (err as { statusCode?: number }).statusCode
      ?? 0;
    return (
      status === 429 ||
      msg.includes('rate limit') ||
      msg.includes('429') ||
      msg.includes('quota')
    );
  }

  /**
   * Best-effort parse of a Retry-After header (seconds) on the error
   * object. Different LLM providers attach headers differently, so we
   * defensively check a couple of shapes. Returns undefined when absent
   * (KeyRotator falls back to its own default cooldown).
   */
  private parseRetryAfterMs(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null) return undefined;
    const obj = err as Record<string, unknown>;
    const headers = (obj.responseHeaders ?? obj.headers) as
      | Record<string, string>
      | undefined;
    if (!headers) return undefined;
    const ra = headers['retry-after'] ?? headers['Retry-After'];
    if (typeof ra !== 'string') return undefined;
    const sec = parseInt(ra, 10);
    if (Number.isNaN(sec) || sec < 0) return undefined;
    return sec * 1000;
  }
}

// Re-export for callers — kept here so a single import gives them the
// service and the typed config they need.
export type { PaidLlmConfig };
