# BriefIQ

> **Question-driven AI briefing system. Native iOS app + NestJS backend. Push only on real signal.**

BriefIQ tracks user-submitted natural-language questions — *"Track the dollar rate in Bangladesh"*, *"Any new BUET admissions news?"* — and delivers AI-summarized briefings **only when something meaningfully changes.**

**Silence is a feature, not a bug.** No engagement metrics. No notification fatigue. Just signal.

---

## Why BriefIQ?

Most news apps are built around **topics**. Users follow broad categories like "Tech" or "Business" and get buried in irrelevant content. The result: notification fatigue, low signal-to-noise ratio, and apps uninstalled within days.

People don't think in topics. They think in **questions**:

- *"Is the iPhone price dropping in Bangladesh?"*
- *"Any new scholarships this week?"*
- *"What's happening with the dollar rate?"*
- *"When does BUET open admissions?"*

BriefIQ is the first app built around that mental model.

---

## How it works

```
User Query (Natural Language)
        |
        v
Query Understanding (LLM)         intent + sources + frequency
        |
        v
Scheduled Fetch Engine            Tavily search, BullMQ cron
        |
        v
Delta Detection (hybrid)          numeric + embedding + LLM tiebreaker
        |
        v
Briefing Generator (LLM)          summarize + rank by importance
        |
        v
Delivery                          APNs push / digest / in-app feed
```

1. **Ask** — submit a question in natural language.
2. **Schedule** — the AI assigns a smart polling frequency (hourly / daily / weekly).
3. **Detect** — every fetch cycle compares new results against the previous snapshot. *Did something meaningfully change?*
4. **Deliver** — only genuine signal becomes a push notification or a daily digest.

Full product spec lives in [`briefiq-app-idea.md`](./briefiq-app-idea.md).

---

## Key features

- **Question-first interface** — natural language in, curated intelligence out.
- **Signal-only notifications** — zero noise policy. Notifications fire only on meaningful change.
- **Smart frequency engine** — queries auto-classified by urgency and update cadence.
- **Memory layer** — embedding-dedup against the last 30 days. Never repeat a briefing the user has already seen.
- **Daily digest mode** — bundle everything into one morning briefing for users who prefer it.
- **Native iOS polish** — APNs interruption levels, Live Activities, Widgets, Focus mode, App Intents (Siri).

---

## Tech stack

### Backend — `briefiq-api/`

| Layer | Choice |
|---|---|
| Runtime | Node 20 LTS, TypeScript 5 |
| Framework | NestJS 10 |
| Database | Postgres 16 + pgvector (HNSW index) |
| ORM | Drizzle (first-class pgvector support) |
| Queue / cron | BullMQ + `@nestjs/schedule` (Redis 7) |
| LLM gateway | Vercel AI SDK -> OpenRouter (free auto-router for prototype) |
| Embeddings | `@xenova/transformers` bge-small (384-dim, in-process, free) |
| Search | Tavily AI Search (primary), Firecrawl (fallback) |
| Push | `@parse/node-apn` (APNs HTTP/2) |
| Hosting | Fly.io + Neon (Postgres) + Upstash (Redis) |

### iOS — `BriefIQ-iOS/`

| Layer | Choice |
|---|---|
| Language | Swift 6 |
| UI | SwiftUI, iOS 17+ minimum |
| State | Observation framework (`@Observable`), no Combine |
| Networking | `URLSession` + `async/await` (no Alamofire) |
| Persistence | SwiftData (local read-cache only — server is source of truth) |
| Native APIs | ActivityKit, WidgetKit, App Intents, UserNotifications |
| Auth | Sign in with Apple (`AuthenticationServices`) |
| Project gen | xcodegen (`project.yml` is the source of truth) |

Two-paragraph reasoning for every major decision lives in [`briefiq_ios_architecture_exec.plan.md`](./briefiq_ios_architecture_exec.plan.md).

---

## Repo layout

```
BriefQ/
|-- README.md                              <- you are here
|-- AGENTS.md                              canonical context for AI coding agents
|-- CLAUDE.md                              pointer to AGENTS.md
|-- briefiq-app-idea.md                    product spec
|-- briefiq-prototype.html                 HTML/CSS UI prototype (dark mode)
|-- briefiq_ios_architecture_exec.plan.md  8-week build plan + decisions
|
|-- briefiq-api/                           NestJS backend
|   |-- src/                               source
|   |-- drizzle/migrations/                SQL migrations
|   |-- test/                              Jest specs
|   `-- README.md                          backend-specific quickstart
|
|-- BriefIQ-iOS/                           SwiftUI client
|   |-- App/                               app shell + theme
|   |-- Core/                              networking, auth, models
|   |-- Features/                          Feed, Queries, AddQuery, Settings, Detail
|   |-- Tests/                             unit tests
|   |-- project.yml                        xcodegen project definition
|   `-- README.md                          iOS-specific quickstart
|
`-- .cursor/                               AI agent rules + workflow skills
    |-- rules/                             file-specific guidance
    `-- skills/                            repeated workflows (add-llm-prompt, etc.)
```

---

## Quick start

### Backend

```bash
cd briefiq-api
npm install
copy .env.example .env             # Windows  (cp on macOS/Linux)
docker compose up postgres redis -d
npm run drizzle:migrate
npm run dev
# -> http://localhost:3000/health
```

Full backend docs: [`briefiq-api/README.md`](./briefiq-api/README.md)

### iOS (requires a Mac with Xcode 15+)

```bash
cd BriefIQ-iOS
brew install xcodegen
xcodegen generate
open BriefIQ.xcodeproj
```

Full iOS docs: [`BriefIQ-iOS/README.md`](./BriefIQ-iOS/README.md)

---

## Documentation

| Doc | What's in it |
|---|---|
| [`briefiq-app-idea.md`](./briefiq-app-idea.md) | Product spec, target users, philosophy |
| [`briefiq_ios_architecture_exec.plan.md`](./briefiq_ios_architecture_exec.plan.md) | Architecture decisions with two-paragraph reasoning, 8-week phased roadmap |
| [`AGENTS.md`](./AGENTS.md) | Canonical context for AI coding agents |
| [`briefiq-api/README.md`](./briefiq-api/README.md) | Backend setup, REST surface, env vars |
| [`BriefIQ-iOS/README.md`](./BriefIQ-iOS/README.md) | iOS setup, project layout, what works today |
| [`briefiq-prototype.html`](./briefiq-prototype.html) | Dark-mode HTML/CSS UI prototype |

---

## Roadmap

The 8-week MVP plan with phased deliverables is in [`briefiq_ios_architecture_exec.plan.md`](./briefiq_ios_architecture_exec.plan.md).

| Week | Focus |
|---|---|
| 1 | Scaffold iOS app + NestJS backend |
| 2 | Query understanding (LLM intent extraction) |
| 3 | Fetch + snapshot + embeddings + pgvector |
| 4 | Delta detection + briefing generator |
| 5 | APNs + quiet hours + Settings |
| 6 | Query Detail + feedback loop |
| 7 | Daily digest mode |
| 8 | Live Activity + Widget + App Intents |

---

## Project philosophy

> Build for **attention respect**, not engagement metrics. The best version of this app is one users open less often — but trust completely.

- **Silence is a feature.** Empty briefings are valid output, never an error.
- **Push only on real signal.** Default to digest; immediate push only for `important` interruption level.
- **Respect attention.** No engagement metrics. Honor quiet hours, Focus modes, and Sleep schedules.
- **Memory matters.** Never repeat a briefing the user has already seen.

---

## Status

**Concept Stage / Week 1 skeleton** — the four-tab iOS shell renders with mock data, the NestJS backend boots with the full REST surface stubbed, and the LLM gateway pattern is wired. Active development.

---

## Contributing

Issues and pull requests welcome. Before contributing:

1. Read [`AGENTS.md`](./AGENTS.md) for project conventions.
2. Read the relevant subproject README.
3. Keep files under 200 lines, write tests for meaningful changes, prefer simplicity over cleverness.

---

## License

This project is currently **unlicensed** (all rights reserved by default). A formal license will be added before any public release.
