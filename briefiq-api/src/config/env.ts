// Typed env loader. Validates `process.env` with Zod at startup.
//
// Why Zod here even though NestJS has @nestjs/config: ConfigService is
// stringly-typed. Zod gives us compile-time + runtime guarantees AND
// serves as living documentation of every env var the app expects.
//
// Anywhere in the app that needs an env var should import `getEnv()` —
// never read process.env directly. That makes test mocking trivial and
// keeps default values in one place.

import { z } from 'zod';

// One schema = one source of truth. Update .env.example when you add a key.
const EnvSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Database / Redis
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Auth
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be >= 16 chars'),
  JWT_EXPIRES_IN: z.string().default('30d'),

  // ── LLM gateway (Vercel AI SDK -> OpenRouter pattern) ──
  LLM_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),

  // Multi-key rotation. Comma-separated list of OpenRouter API keys.
  // The KeyRotator picks the least-loaded healthy key on every call and
  // puts a key on cooldown when it 429s. Stacking N free accounts gives
  // N× the effective per-day quota at zero cost.
  // See `getOpenRouterKeys()` below for resolution order.
  OPENROUTER_API_KEYS: z.string().optional().default(''),

  // Legacy single-key fallback. Used only if OPENROUTER_API_KEYS is empty.
  LLM_API_KEY: z.string().optional().default(''),

  // Default model name. `openrouter/auto` is the free auto-router.
  LLM_MODEL: z.string().min(1).default('openrouter/auto'),

  // Pinned cascade walked when the default model fails. Comma-separated.
  LLM_FREE_CASCADE: z
    .string()
    .default(
      'google/gemma-4-31b-it:free,nvidia/nemotron-3-super-120b-a12b:free,openai/gpt-oss-20b:free',
    ),

  // ── Paid fallback (optional, last resort) ──
  // When set, the LLM cascade tries this AFTER every free key/model combo
  // has failed or been throttled. Leave blank to enforce free-only behavior
  // (silence-is-a-feature: degrade gracefully instead of charging).
  PAID_LLM_BASE_URL: z
    .string()
    .url()
    .optional()
    .default('https://openrouter.ai/api/v1'),
  PAID_LLM_API_KEY: z.string().optional().default(''),
  PAID_LLM_MODEL: z.string().optional().default(''),

  // ── Local Ollama fallback (last resort, free, runs on dev machine) ──
  // Set OLLAMA_BASE_URL to http://localhost:11434/v1 (native) or
  // http://host.docker.internal:11434/v1 (from inside Docker).
  // Leave blank to disable Ollama fallback.
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().optional().default('qwen3.5:9b'),

  // ── Search ──
  TAVILY_API_KEY: z.string().min(1).optional(),
  FIRECRAWL_API_KEY: z.string().optional(),

  // ── Apple Sign-In (optional during prototype) ──
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),

  // ── APNs (optional during prototype) ──
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID: z.string().default('com.briefiq.app'),
  APNS_PRIVATE_KEY: z.string().optional(),
  APNS_PRODUCTION: z.coerce.boolean().default(false),

  // ── Monitoring (optional) ──
  // SENTRY_DSN: set + install @sentry/nestjs to forward errors to Sentry.
  SENTRY_DSN: z.string().url().optional(),

  // OPS_READ_TOKEN: required in production to read GET /ops/events|summary.
  OPS_READ_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

// Cached after first call so we don't re-parse on every import.
let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Render Zod errors as a readable list so the missing var jumps out.
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `\nInvalid environment variables. Check your .env against .env.example:\n${issues}\n`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Convenience accessor used inside services. */
export function getEnv(): Env {
  return loadEnv();
}

/** Parse the cascade string into an ordered array of model names. */
export function getFreeModelCascade(): string[] {
  return getEnv()
    .LLM_FREE_CASCADE.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolve the list of OpenRouter API keys to rotate across.
 *
 * Resolution order:
 *   1. OPENROUTER_API_KEYS (multi-key, comma-separated) — preferred
 *   2. LLM_API_KEY (single key, legacy)
 *
 * Throws if neither is set. Called once by ServicesModule's KeyRotator
 * factory at boot, so misconfig fails fast with a readable message.
 */
export function getOpenRouterKeys(): string[] {
  const env = getEnv();
  const fromMulti = env.OPENROUTER_API_KEYS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromMulti.length > 0) return fromMulti;
  if (env.LLM_API_KEY) return [env.LLM_API_KEY];
  throw new Error(
    'No OpenRouter keys configured. Set OPENROUTER_API_KEYS in .env ' +
      '(comma-separated). See .env.example for details.',
  );
}

/** Local Ollama config — null when OLLAMA_BASE_URL is not set. */
export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export function getOllamaConfig(): OllamaConfig | null {
  const env = getEnv();
  if (!env.OLLAMA_BASE_URL) return null;
  return { baseUrl: env.OLLAMA_BASE_URL, model: env.OLLAMA_MODEL };
}

/** Optional paid fallback config — null when not configured. */
export interface PaidLlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function getPaidLlmConfig(): PaidLlmConfig | null {
  const env = getEnv();
  if (!env.PAID_LLM_API_KEY || !env.PAID_LLM_MODEL) return null;
  return {
    baseUrl: env.PAID_LLM_BASE_URL,
    apiKey: env.PAID_LLM_API_KEY,
    model: env.PAID_LLM_MODEL,
  };
}
