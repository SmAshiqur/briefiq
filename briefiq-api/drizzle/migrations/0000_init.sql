-- Initial migration. Creates the pgvector extension first, then tables.
--
-- Hand-written rather than drizzle-kit-generated for two reasons:
--   1. CREATE EXTENSION must run before any table that uses vector(),
--      and drizzle-kit doesn't auto-emit extension statements.
--   2. We can ship a usable migration with the repo so the first run
--      after `npm install` is just: drizzle:migrate.
--
-- Future schema changes should use:  npm run drizzle:generate

-- ── Extensions ──
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

-- ── Enums ──
CREATE TYPE query_intent AS ENUM ('trend', 'event', 'policy', 'listing', 'price', 'other');
CREATE TYPE query_frequency AS ENUM ('hourly', 'daily', 'weekly');
CREATE TYPE query_status AS ENUM ('active', 'paused', 'archived');
CREATE TYPE briefing_importance AS ENUM ('important', 'new', 'minor');
CREATE TYPE feedback_rating AS ENUM ('useful', 'noise');

-- ── users ──
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "apple_sub" text NOT NULL,
  "email" text,
  "push_token" text,
  "quiet_start" text DEFAULT '22:00',
  "quiet_end" text DEFAULT '07:00',
  "digest_time" text DEFAULT '08:00',
  "default_threshold" text NOT NULL DEFAULT 'balanced',
  "default_detail" text NOT NULL DEFAULT 'standard',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "users_apple_sub_ux" ON "users" ("apple_sub");

-- ── queries ──
CREATE TABLE "queries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "raw_text" text NOT NULL,
  "intent_type" query_intent NOT NULL DEFAULT 'other',
  "sources_json" jsonb,
  "frequency" query_frequency NOT NULL DEFAULT 'daily',
  "custom_cron" text,
  "signal_threshold" text,
  "status" query_status NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_checked_at" timestamptz,
  "next_check_at" timestamptz
);
CREATE INDEX "queries_user_idx" ON "queries" ("user_id");
CREATE INDEX "queries_next_check_idx" ON "queries" ("next_check_at");

-- ── fetches ──
CREATE TABLE "fetches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "query_id" uuid NOT NULL REFERENCES "queries"("id") ON DELETE CASCADE,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "status" text NOT NULL DEFAULT 'ok',
  "raw_payload_url" text,
  "error" text
);
CREATE INDEX "fetches_query_idx" ON "fetches" ("query_id");

-- ── snapshots ──
-- vector(384) matches Xenova/bge-small-en-v1.5 (384-dim, normalized).
CREATE TABLE "snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "query_id" uuid NOT NULL REFERENCES "queries"("id") ON DELETE CASCADE,
  "fetch_id" uuid NOT NULL REFERENCES "fetches"("id") ON DELETE CASCADE,
  "structured_json" jsonb NOT NULL,
  "embedding" vector(384),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "snapshots_query_idx" ON "snapshots" ("query_id");
-- HNSW + cosine ops: sub-10ms similarity at our scale (well under 50M vectors).
CREATE INDEX "snapshots_emb_hnsw"
  ON "snapshots" USING hnsw ("embedding" vector_cosine_ops);

-- ── briefings ──
CREATE TABLE "briefings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "query_id" uuid NOT NULL REFERENCES "queries"("id") ON DELETE CASCADE,
  "fetch_id" uuid NOT NULL REFERENCES "fetches"("id") ON DELETE CASCADE,
  "prev_snapshot_id" uuid,
  "delta_verdict" text NOT NULL,
  "importance" briefing_importance NOT NULL DEFAULT 'new',
  "summary" text NOT NULL,
  "sources_json" jsonb,
  "delivered_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "briefings_query_idx" ON "briefings" ("query_id");
CREATE INDEX "briefings_delivered_idx" ON "briefings" ("delivered_at");

-- ── feedback ──
CREATE TABLE "feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "briefing_id" uuid NOT NULL REFERENCES "briefings"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "rating" feedback_rating NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
-- One feedback row per (user, briefing); UPSERT to overwrite.
CREATE UNIQUE INDEX "feedback_user_briefing_ux"
  ON "feedback" ("user_id", "briefing_id");

-- ── notifications ──
CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "briefing_id" uuid REFERENCES "briefings"("id") ON DELETE SET NULL,
  "channel" text NOT NULL,
  "status" text NOT NULL,
  "sent_at" timestamptz DEFAULT now()
);
CREATE INDEX "notifications_user_idx" ON "notifications" ("user_id");

-- ── sources ──
CREATE TABLE "sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "domain" text NOT NULL UNIQUE,
  "reliability_score" integer NOT NULL DEFAULT 50,
  "last_failure_at" timestamptz
);
