# BriefIQ API

NestJS backend for [BriefIQ](../briefiq-app-idea.md) — the question-driven AI briefing system. Read [`AGENTS.md`](../AGENTS.md) at the repo root for project context, then [`briefiq_ios_architecture_exec.plan.md`](../briefiq_ios_architecture_exec.plan.md) for the full architecture and reasoning.

## Stack

- **Node 20+** / **TypeScript 5** / **NestJS 10**
- **Drizzle ORM** + Postgres 16 + **pgvector** (HNSW)
- **Redis 7** + **BullMQ** for queues
- **Vercel AI SDK** + **OpenRouter** (free auto-router for prototype)
- **`@xenova/transformers`** for local bge-small embeddings (384-dim, free)
- **Tavily** for AI search, **node-apn** for APNs

## Quick start (Windows / Mac / Linux)

```bash
cd briefiq-api

# 1. Install deps. Use npm because pnpm isn't installed by default on Windows.
#    pnpm works too if you have it.
npm install

# 2. Copy env and fill in real values.
#    Minimum to boot: DATABASE_URL, REDIS_URL, JWT_SECRET, LLM_API_KEY.
copy .env.example .env       # Windows
# cp .env.example .env       # Mac / Linux

# 3. Bring up local Postgres+pgvector and Redis.
#    If you don't have Docker locally, you can use Neon (Postgres+pgvector
#    free tier: https://neon.tech) and Upstash (Redis free tier:
#    https://upstash.com) — just paste the URLs into .env.
docker compose up -d

# 4. Apply the initial migration (creates pgvector extension + all tables).
npm run drizzle:migrate

# 5. Start the API in watch mode.
npm run dev

# 6. Verify.
curl http://localhost:3000/health
# -> { ok: true, service: "briefiq-api", ... }
```

## Project layout

```
src/
  main.ts                bootstrap NestJS, global ValidationPipe + CORS
  app.module.ts          root module — wires everything together
  health.controller.ts   GET /health
  config/env.ts          Zod-validated env loader (single source of truth)
  db/
    schema.ts            Drizzle schema (users, queries, snapshots, briefings, ...)
    client.ts            postgres-js + drizzle wrapper, DI token
    database.module.ts   global DB module
    migrate.ts           migration runner (npm run drizzle:migrate)
  services/              shared infrastructure / AI services
    services.module.ts
    llm.service.ts       Vercel AI SDK + OpenRouter cascade + free-tier fallback
    embeddings.service.ts  Xenova bge-small (384-dim, in-process)
    search.service.ts    Tavily wrapper
    snapshot.service.ts  fact extraction
    delta.service.ts     hybrid delta detector (numeric + embedding + LLM)
    briefing.service.ts  summarize + persist briefings
    apns.service.ts      @parse/node-apn sender (stubbed without keys)
    quiet-hours.service.ts  delivery gate
  modules/               REST surface
    auth/                Apple Sign-In + JWT + dev sign-in
    queries/             /queries/analyze, CRUD
    briefings/           /briefings/today, /briefings/:id
    feedback/            POST /briefings/:id/feedback
    settings/            GET / PATCH /settings
    push/                POST /push/register
drizzle/
  migrations/            SQL migrations (0000_init.sql is hand-written)
test/                    Jest specs
```

## REST surface

```
GET  /health                     — liveness probe

POST /auth/apple                 — exchange Apple identityToken for session JWT
POST /auth/dev                   — dev-only shortcut, returns JWT for a fake user

POST /queries/analyze            — LLM intent extraction (returns proposed sources/freq)
POST /queries                    — create + schedule
GET  /queries                    — list
GET  /queries/:id                — single
PATCH /queries/:id               — pause / resume / change frequency
DELETE /queries/:id

GET  /briefings/today            — feed payload (changes + still-monitoring)
GET  /briefings/:id              — single

POST /briefings/:id/feedback     — { rating: 'useful' | 'noise' }

GET  /settings
PATCH /settings                  — quiet hours, digest time, threshold

POST /push/register              — { deviceToken }
```

All endpoints except `/health` and `/auth/*` require `Authorization: Bearer <jwt>`.

## Try it without Apple credentials

You're on Windows or just want to iterate without registering an Apple Developer team. Use the dev sign-in:

```bash
# Get a JWT for a fake user
curl -X POST http://localhost:3000/auth/dev \
  -H "Content-Type: application/json" \
  -d '{"handle":"rafid"}'

# Save the token, then:
TOKEN=...

# Analyze a query
curl -X POST http://localhost:3000/queries/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Track dollar rate in Bangladesh"}'
```

## Notes & gotchas

- **First `embed()` call downloads the bge-small model (~50MB)** into `./.cache/`. We warm it at module init so user-facing requests don't pay this cost. Subsequent runs reuse the cache.
- **`drizzle:generate` requires a live DB connection.** The repo ships with a hand-written `0000_init.sql` so you can `drizzle:migrate` straight away.
- **APNs is stubbed without keys.** The pipeline runs end-to-end and logs "would push" payloads. Add `APNS_*` env vars to enable real sends.
- **Free-tier rate limits.** OpenRouter free tier is 20 req/min globally. The LLM service auto-cascades to backup models on 429.
