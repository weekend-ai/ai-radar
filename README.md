# AI Radar

> AI intelligence radar & newsletter generator — fetches multi-source AI signals,
> dedupes, scores, clusters into topics, and drafts bilingual newsletters.

This is the MVP scaffold from the [planning doc](./docs/mvp-plan.md).
Current state: **Day 1–2 minimal loop** (sources seed + RSS fetch + Inbox/Sources UI).

LLM enrichment (Day 5), topic clustering (Day 6–7), newsletter draft generator (Day 8)
and bilingual switch (Day 9) follow.

---

## Stack

- **Next.js 15** (App Router) + React 19 + Tailwind
- **TypeScript** strict
- **Postgres 16** + **pgvector** (via Docker)
- **Drizzle ORM** + drizzle-kit
- **Redis** (queue, used from Day 3+)
- **rss-parser** for feed ingestion
- **OpenAI** for enrichment (added Day 5)
- **pnpm** workspaces (single package for MVP)

## Quick start

```bash
# 1. install deps
pnpm install

# 2. start postgres + redis
docker compose up -d

# 3. configure env
cp .env.example .env
# (OPENAI_API_KEY only needed for Day 5+)

# 4. push schema & seed sources
pnpm db:push
pnpm db:seed

# 5. fetch your first articles
pnpm worker:fetch

# 6. open the app
pnpm dev
# → http://localhost:3000
```

## Layout

```
ai-radar/
├── app/                    # Next.js routes (dashboard, inbox, sources, topics, drafts)
│   └── api/                # server actions / fetch endpoints
├── lib/
│   ├── db/                 # Drizzle schema + client
│   ├── fetcher/            # RSS parser, dedup, ingest pipeline
│   └── seed/               # initial sources list
├── workers/                # standalone node entrypoints (fetch, scheduler)
├── scripts/                # migrate, seed CLI helpers
├── drizzle/                # generated migrations
├── docker-compose.yml      # local postgres + redis
└── docs/                   # mvp plan + design notes
```

## Roadmap

See `docs/mvp-plan.md` for the full 10-day breakdown. Top-level milestones:

| Week | Days | Deliverable |
| ---- | ---- | ----------- |
| 1    | 1–2  | Sources + RSS fetch + Inbox (✅ in scaffold) |
| 1    | 3    | BullMQ scheduler + worker |
| 1    | 4–5  | LLM enrichment, scoring, summaries on Inbox |
| 2    | 6–7  | Embeddings → topic clustering → Topic Radar |
| 2    | 8    | Newsletter draft generator |
| 2    | 9    | i18n / bilingual content |
| 2    | 10   | Polish + deploy |

## License

MIT — see `LICENSE`.
