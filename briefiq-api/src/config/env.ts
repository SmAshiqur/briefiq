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

  // LLM gateway (Vercel AI SDK -> OpenRouter pattern)
  LLM_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1).default('openrouter/auto'),
  // Comma-separated pinned cascade. When the auto-router 429s, we walk this
  // list one model at a time. See services/llm.service.ts withFreeTierFallback.
  LLM_FREE_CASCADE: z
    .string()
    .default(
      'deepseek/deepseek-chat:free,qwen/qwen3-coder-480b:free,openai/gpt-oss-20b:free',
    ),

  // Search
  TAVILY_API_KEY: z.string().min(1).optional(),
  FIRECRAWL_API_KEY: z.string().optional(),

  // Apple Sign-In (optional during prototype; required for prod auth)
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),

  // APNs (optional during prototype; required to actually send pushes)
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID: z.string().default('com.briefiq.app'),
  APNS_PRIVATE_KEY: z.string().optional(),
  APNS_PRODUCTION: z.coerce.boolean().default(false),
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
