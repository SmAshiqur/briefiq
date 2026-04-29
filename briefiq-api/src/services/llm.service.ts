// LLM gateway service.
//
// Single entrypoint for every structured-output prompt the app needs. Built
// on Vercel AI SDK + Zod + OpenRouter. The pattern lets us swap free
// auto-router for paid Claude/GPT by changing one env var — never code.
//
// Two public methods today:
//   understandQuery(text)        — query understanding (Add Query screen)
//   summarizeDelta(delta, ...)   — briefing summary (after delta detected)
//
// Add new ones by following .cursor/skills/add-llm-prompt/SKILL.md.

import { Injectable, Logger } from '@nestjs/common';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { getEnv, getFreeModelCascade } from '../config/env';

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

// ── Service ──────────────────────────────────────────────────────────────

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  // The OpenAI-compatible router. Built lazily on first use so test-time
  // mocks can replace it before any real call goes out.
  private routerCache: ReturnType<typeof createOpenAI> | null = null;

  private getRouter() {
    if (this.routerCache) return this.routerCache;
    const env = getEnv();
    this.routerCache = createOpenAI({
      baseURL: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY,
      // OpenRouter ignores org headers; safe to leave default.
    });
    return this.routerCache;
  }

  /**
   * Run query understanding on a freshly submitted user query. Powers the
   * "Analyze with AI →" panel on the iOS Add Query screen.
   */
  async understandQuery(text: string): Promise<QueryUnderstanding> {
    return this.withFreeTierFallback(async (modelName) => {
      const { object } = await generateObject({
        model: this.getRouter()(modelName),
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
    return this.withFreeTierFallback(async (modelName) => {
      const { object } = await generateObject({
        model: this.getRouter()(modelName),
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

  // ── Private: free-tier fallback cascade ──────────────────────────────

  /**
   * Wraps a single generateObject call with:
   *   - 1s/2s/4s exponential backoff on 429 (rate limit)
   *   - Cascade through LLM_FREE_CASCADE on auth/availability errors
   *
   * The fn receives the model name to use, so callers don't have to pass
   * model into every call site — they just write the prompt.
   *
   * If every model fails, throws so the caller can degrade the cycle to
   * "no fresh briefing" rather than crashing the worker.
   */
  private async withFreeTierFallback<T>(
    fn: (modelName: string) => Promise<T>,
  ): Promise<T> {
    const env = getEnv();
    // Try the configured model first, then cascade as backup.
    const candidates = [env.LLM_MODEL, ...getFreeModelCascade()].filter(
      // de-dupe in case someone sets LLM_MODEL to one of the cascade members
      (v, i, a) => a.indexOf(v) === i,
    );

    let lastErr: unknown = null;
    for (const model of candidates) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await fn(model);
        } catch (err) {
          lastErr = err;
          // 429 -> backoff and retry on the same model.
          if (this.isRateLimit(err)) {
            const wait = 1000 * Math.pow(2, attempt);
            this.logger.warn(
              `Rate-limited on ${model}, retrying in ${wait}ms`,
            );
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          // Non-retryable on this model -> break to next model in cascade.
          this.logger.warn(
            `LLM call failed on ${model}: ${(err as Error).message}. Cascading.`,
          );
          break;
        }
      }
    }

    throw new LlmExhaustedError(
      'All free-tier models exhausted',
      lastErr instanceof Error ? lastErr : undefined,
    );
  }

  private isRateLimit(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    const msg = String((err as { message?: unknown }).message ?? '').toLowerCase();
    const status = (err as { status?: number }).status ?? 0;
    return status === 429 || msg.includes('rate limit') || msg.includes('429');
  }
}

/**
 * Thrown when every free-tier model in the cascade has failed. Catch this
 * at the worker level and log; do not bubble to the user.
 */
export class LlmExhaustedError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'LlmExhaustedError';
  }
}
