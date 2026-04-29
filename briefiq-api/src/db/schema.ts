// Drizzle schema — the single source of truth for the BriefIQ DB.
//
// Every table here maps 1:1 to the data model described in
// `briefiq_ios_architecture_exec.plan.md` ("Data model" section).
//
// Drizzle is chosen over Prisma specifically because it has first-class
// `vector()` support for pgvector. Prisma needs `Unsupported("vector")` +
// raw SQL, which fights us at exactly the spot we want type safety.
//
// When you change anything in this file, run:
//   npm run drizzle:generate    # produces a new SQL migration
//   npm run drizzle:migrate     # applies it locally

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  vector,
  index,
  pgEnum,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ── Enums ────────────────────────────────────────────────────────────────

// Coarse intent labels used by the LLM query-understanding step.
// Driven by the schema in services/llm.service.ts (QueryUnderstanding).
export const queryIntent = pgEnum('query_intent', [
  'trend',
  'event',
  'policy',
  'listing',
  'price',
  'other',
]);

export const queryFrequency = pgEnum('query_frequency', [
  'hourly',
  'daily',
  'weekly',
]);

export const queryStatus = pgEnum('query_status', [
  'active',
  'paused',
  'archived',
]);

// Three-level importance — drives APNs interruption-level + UI priority bar.
// Maps directly to the red / amber / green stripes in the iOS prototype.
export const briefingImportance = pgEnum('briefing_importance', [
  'important', // red: time-sensitive push
  'new', // green: informational push, normal interruption
  'minor', // amber: digest-only, never standalone push
]);

export const feedbackRating = pgEnum('feedback_rating', ['useful', 'noise']);

// ── Users ────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Apple's stable user identifier ("sub" in the identity token JWT).
    // Unique per Apple ID + per app. Never re-issued.
    appleSub: text('apple_sub').notNull(),

    // Email may be null when the user picks "Hide my email" at sign-in time;
    // Apple still gives us a relay address but we don't require it.
    email: text('email'),

    // Latest APNs device token. Replaced on every app launch (tokens rotate).
    pushToken: text('push_token'),

    // Quiet-hours window (24h "HH:MM" strings, user-local time). Delivery
    // gate in services/quiet-hours.service.ts uses these.
    quietStart: text('quiet_start').default('22:00'),
    quietEnd: text('quiet_end').default('07:00'),

    // When the daily digest fires (HH:MM, user-local).
    digestTime: text('digest_time').default('08:00'),

    // Default delta sensitivity — auto-tuned over time by feedback signals.
    // 'balanced' is the prototype default per the plan.
    defaultThreshold: text('default_threshold', {
      enum: ['loose', 'balanced', 'strict'],
    })
      .notNull()
      .default('balanced'),

    // Briefing detail level: short headline vs. fuller summary.
    defaultDetail: text('default_detail', {
      enum: ['headline', 'standard', 'detailed'],
    })
      .notNull()
      .default('standard'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // One row per Apple sub. Sign-in upsert relies on this.
    appleSubUx: uniqueIndex('users_apple_sub_ux').on(t.appleSub),
  }),
);

// ── Queries ──────────────────────────────────────────────────────────────

export const queries = pgTable(
  'queries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // The user's natural-language input. Preserved verbatim so the original
    // intent is recoverable even after the AI parse changes.
    rawText: text('raw_text').notNull(),

    intentType: queryIntent('intent_type').notNull().default('other'),

    // Allowlist of source domains the LLM picked. Persisted as JSON so we
    // can grow the per-source metadata (priority, region) without migrating.
    sourcesJson: jsonb('sources_json').$type<{ domains: string[] }>(),

    frequency: queryFrequency('frequency').notNull().default('daily'),

    // Optional override — if the user picks "Custom" we store a cron string
    // and `frequency` becomes informational only.
    customCron: text('custom_cron'),

    // Per-query override of the user-level threshold.
    signalThreshold: text('signal_threshold', {
      enum: ['loose', 'balanced', 'strict'],
    }),

    status: queryStatus('status').notNull().default('active'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Updated by the worker after every cycle. Drives "Last checked Xh ago".
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    // Used by the scheduler to pick the next batch of queries to fetch.
    nextCheckAt: timestamp('next_check_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('queries_user_idx').on(t.userId),
    nextCheckIdx: index('queries_next_check_idx').on(t.nextCheckAt),
  }),
);

// ── Fetches ──────────────────────────────────────────────────────────────

// One row per attempt to refresh a query (success or failure). Useful as
// an audit trail and for retry logic.
export const fetches = pgTable(
  'fetches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    queryId: uuid('query_id')
      .notNull()
      .references(() => queries.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    // 'ok' | 'partial' | 'error'
    status: text('status').notNull().default('ok'),
    // Where the raw search/scrape payload was archived (S3 key, etc.). May
    // be null in dev where we keep payloads in-memory.
    rawPayloadUrl: text('raw_payload_url'),
    error: text('error'),
  },
  (t) => ({
    queryIdx: index('fetches_query_idx').on(t.queryId),
  }),
);

// ── Snapshots ────────────────────────────────────────────────────────────

// Structured AI extraction of a single fetch — numbers, entities, dates —
// plus a 384-dim embedding for similarity / dedup.
//
// 384 matches `Xenova/bge-small-en-v1.5`. If you ever swap to OpenAI's
// text-embedding-3-small, bump to 1536 and write a backfill script.
export const snapshots = pgTable(
  'snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    queryId: uuid('query_id')
      .notNull()
      .references(() => queries.id, { onDelete: 'cascade' }),
    fetchId: uuid('fetch_id')
      .notNull()
      .references(() => fetches.id, { onDelete: 'cascade' }),

    // Free-form structured facts produced by services/snapshot.service.ts.
    // jsonb so we can query individual fields later (e.g. dollar_rate).
    structuredJson: jsonb('structured_json').notNull(),

    // pgvector column. Nullable to allow degraded ingestion when the
    // embeddings model is unavailable (we still keep the row).
    embedding: vector('embedding', { dimensions: 384 }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    queryIdx: index('snapshots_query_idx').on(t.queryId),
    // HNSW index for sub-10ms cosine similarity at our scale. The cosine
    // ops class is the right choice for normalized bge-small vectors.
    embIdx: index('snapshots_emb_hnsw').using(
      'hnsw',
      t.embedding.op('vector_cosine_ops'),
    ),
  }),
);

// ── Briefings ────────────────────────────────────────────────────────────

// One row per "we decided to tell the user about this" event. Empty cycles
// (no meaningful change) intentionally produce zero briefings — silence is
// a feature.
export const briefings = pgTable(
  'briefings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    queryId: uuid('query_id')
      .notNull()
      .references(() => queries.id, { onDelete: 'cascade' }),
    fetchId: uuid('fetch_id')
      .notNull()
      .references(() => fetches.id, { onDelete: 'cascade' }),
    // The snapshot this briefing replaces in the user's mental model.
    prevSnapshotId: uuid('prev_snapshot_id'),

    // Free-form delta verdict ("rate up by 2 BDT", "1 new listing", etc.).
    deltaVerdict: text('delta_verdict').notNull(),

    importance: briefingImportance('importance').notNull().default('new'),

    // The summary string shown in the iOS feed card (≤2 sentences).
    summary: text('summary').notNull(),

    // Sources cited inline in the summary. Kept separate from the query's
    // overall sources list because each briefing may use a subset.
    sourcesJson: jsonb('sources_json').$type<{ domains: string[] }>(),

    // Set when the push or in-app card is actually delivered. Null until.
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    queryIdx: index('briefings_query_idx').on(t.queryId),
    deliveredIdx: index('briefings_delivered_idx').on(t.deliveredAt),
  }),
);

// ── Feedback ─────────────────────────────────────────────────────────────

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    briefingId: uuid('briefing_id')
      .notNull()
      .references(() => briefings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: feedbackRating('rating').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // One feedback per (user, briefing). Re-rating overwrites via upsert.
    uniqUserBriefing: uniqueIndex('feedback_user_briefing_ux').on(
      t.userId,
      t.briefingId,
    ),
  }),
);

// ── Notifications ────────────────────────────────────────────────────────

// Audit row for every push attempt. Lets us see "we sent this" vs "we
// suppressed because quiet-hours" vs "APNs failed".
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    briefingId: uuid('briefing_id').references(() => briefings.id, {
      onDelete: 'set null',
    }),
    // 'apns' | 'in_app' | 'digest'
    channel: text('channel').notNull(),
    // 'sent' | 'suppressed_quiet_hours' | 'failed'
    status: text('status').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userIdx: index('notifications_user_idx').on(t.userId),
  }),
);

// ── Sources ──────────────────────────────────────────────────────────────

// Reliability scoring per domain. Updated by the briefing pipeline whenever
// a fetch from this domain returns useful (or noisy) data.
export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  domain: text('domain').notNull().unique(),
  // 0..100 — nudged up on useful feedback, down on noise / repeated failure.
  reliabilityScore: integer('reliability_score').notNull().default(50),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
});

// ── Relations export point ──────────────────────────────────────────────

// Keep this list current — useful both for Drizzle's relational queries
// and as a quick TOC of the schema.
export const schema = {
  users,
  queries,
  fetches,
  snapshots,
  briefings,
  feedback,
  notifications,
  sources,
};
