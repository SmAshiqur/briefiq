# BriefIQ — Agent Context

> Question-driven AI briefing system. Native iOS app + NestJS backend. Push only on real signal.

This file is the canonical project context for any AI agent working in this repo (Cursor, Claude Code, Copilot, etc.). Read it first.

---

## Product in one paragraph

BriefIQ tracks user-submitted natural-language questions ("Track dollar rate in Bangladesh", "Any new BUET admissions news?") and delivers AI-summarized briefings *only when something meaningfully changes*. Silence is a feature, not a bug. Full spec lives in [briefiq-app-idea.md](briefiq-app-idea.md). Architecture decisions, two-paragraph reasoning for every major choice, and the 8-week MVP roadmap live in [briefiq_ios_architecture_exec.plan.md](briefiq_ios_architecture_exec.plan.md).

---

## Stack at a glance

### iOS — `BriefIQ-iOS/`
- Swift 6, SwiftUI, iOS 17+ minimum
- Observation framework, async/await, `URLSession` (no Alamofire)
- SwiftData (local read-cache only — server is source of truth)
- ActivityKit (Live Activity), WidgetKit, App Intents (Siri), UserNotifications
- Sign in with Apple (`AuthenticationServices`)

### Backend — `briefiq-api/`
- Node 20 LTS, TypeScript 5, NestJS 10
- Drizzle ORM (first-class pgvector support)
- Postgres 16 + `pgvector` extension (HNSW index), Redis 7
- BullMQ (`@nestjs/bullmq`) for queues, `@nestjs/schedule` for cron
- Vercel AI SDK (`ai`, `@ai-sdk/openai`) → OpenRouter (`openrouter/free` for prototype)
- `@xenova/transformers` for local bge-small embeddings (384-dim, in-process, free)
- `@parse/node-apn` for APNs HTTP/2
- Tavily AI Search (primary), Firecrawl (deep-scrape fallback)
- Hosted on Fly.io; managed Postgres (Neon) + Redis (Upstash)

---

## Repo layout

```
BriefQ/
├── AGENTS.md                                this file — read first
├── CLAUDE.md                                pointer to AGENTS.md
├── briefiq-app-idea.md                      product spec
├── briefiq-prototype.html                   HTML/CSS UI prototype
├── briefiq_ios_architecture_exec.plan.md    8-week build plan + decisions
├── BriefIQ-iOS/                             SwiftUI app (Week 1+)
├── briefiq-api/                             NestJS backend (Week 1+)
└── .cursor/
    ├── rules/                               file-specific AI rules
    │   ├── conventions.mdc
    │   ├── swift-ios.mdc
    │   ├── nestjs-backend.mdc
    │   └── ai-pipeline.mdc
    └── skills/                              project workflow skills
        ├── add-llm-prompt/SKILL.md
        ├── add-nestjs-module/SKILL.md
        └── add-ios-feature/SKILL.md
```

---

## Local dev (wired up in Week 1)

### Backend
```bash
cd briefiq-api
pnpm install
cp .env.example .env                  # set OPENROUTER_API_KEY etc.
docker compose up postgres redis -d   # local infra (with pgvector image)
pnpm drizzle:migrate                  # apply schema
pnpm dev                              # nest start --watch
pnpm test                             # jest
```

### iOS
```bash
cd BriefIQ-iOS
open BriefIQ.xcodeproj
# Signing -> select your Team. Run target on simulator.
```

---

## LLM gateway pattern (NEVER hard-code model names)

```ts
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

const router = createOpenAI({
  baseURL: process.env.LLM_BASE_URL!,    // https://openrouter.ai/api/v1
  apiKey: process.env.LLM_API_KEY!,
});

const Schema = z.object({ /* ... */ });

const { object } = await generateObject({
  model: router(process.env.LLM_MODEL!),  // openrouter/free in dev
  schema: Schema,
  prompt: '...',
});
```

Production = swap `LLM_MODEL` env var to `anthropic/claude-3.5-sonnet` (still via OpenRouter) or change `LLM_BASE_URL` to Anthropic native. No code change.

---

## Conventions (project-wide)

- **File size**: keep under 200 lines. Split when growing.
- **Naming**: clear and consistent. `runQueryCycle` not `processIt`. `BriefingCard` not `Card2`.
- **Comments**: be generous, explain WHY (intent, constraints, trade-offs, non-obvious context). Avoid pure narration like `// increment counter`. Good naming covers the WHAT.
- **Never delete old comments** unless obviously obsolete or wrong.
- **No emojis in code.** UI strings are fine.
- **Errors**: don't jump to conclusions. Consider multiple possible causes. Make minimal changes — change as few lines as you need.
- **Tests**: write a test for every meaningful change. Run them after each change.
- **Simplicity over cleverness.** Pick the simpler approach unless there's a concrete reason not to.
- **Verification**: when shipping a feature, tell the user how to test it.

---

## Product philosophy (do not violate)

- **Silence is a feature.** Empty briefings are valid output, never an error condition.
- **Push only on real signal.** Default to digest mode; immediate push only for `important` interruption level.
- **Respect attention.** No engagement metrics. Honor quiet hours, Focus modes, and Sleep schedules.
- **Memory matters.** Never repeat a briefing the user has already seen — embedding-dedup against last 30 days.

---

## Where to find more

- Architecture decisions, two-paragraph reasoning, phased roadmap → [briefiq_ios_architecture_exec.plan.md](briefiq_ios_architecture_exec.plan.md)
- Product spec → [briefiq-app-idea.md](briefiq-app-idea.md)
- File-specific AI rules → [.cursor/rules/](.cursor/rules/)
- Repeated workflow skills → [.cursor/skills/](.cursor/skills/)
