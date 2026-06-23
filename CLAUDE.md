# CLAUDE.md — Repo state & agent operating guide

> Living document. Updated at the end of each significant milestone.
> If you're an AI coding agent (Claude Code, Codex, Cursor, Copilot) reading
> this for context: read top-to-bottom, then start work. The "Conventions"
> and "Pitfalls" sections will save you hours.

**Last updated**: 2026-06-23, after PR #6 (K8s deployment).
**Branch state**: `main` is the source of truth; feature branches squash-merge.

---

## What this repo is

**AI Radar** — a multi-source AI intelligence pipeline + newsletter drafting tool.

```
        ┌─────────────────────────────────────────────────────────┐
        │            ARTICLE PIPELINE (every ~15-60min)           │
        └─────────────────────────────────────────────────────────┘

  sources/RSS/sitemap/arxiv  →  ingest+dedup  →  articles table
                                                      │
                                                      ▼
                                          LLM enrich (gpt-4o-mini)
                                          → score + summary_en + tags
                                                      │
                                                      ▼
                                          embed (text-embedding-3-large @ 1536d)
                                                      │
                                                      ▼
                                          cluster (cosine UnionFind, threshold=0.82)
                                          → topics + topic_articles
                                                      │
                                                      ▼
                          ┌────────────────┴────────────────┐
                          ▼                                 ▼
                  /topics (Topic Radar)         /drafts (bilingual newsletter)
                                                  └─ generator + editor
```

UI: Next.js 15 App Router. Pages: `/inbox` `/sources` `/topics` `/jobs` `/drafts`.
Backend: Postgres 16 + pgvector, Redis (BullMQ), single Node process for workers via tsx.

Repo origin: <https://github.com/weekend-ai/ai-radar> (public).

---

## Tech stack (pinned)

| Layer | Choice | Version | Why |
|---|---|---|---|
| Runtime | Node | 22.x via asdf locally, 22-alpine in image | Stable + bullmq+next 15 compat |
| Package manager | pnpm | **11.8.0** (pinned via `packageManager`) | Workspace ready, faster, lockfile is canon |
| Framework | Next.js | 15.1.3, App Router, typedRoutes | Server components, RSC streaming |
| UI | React 19 + Tailwind 3.4 | | Stock Next setup |
| ORM | Drizzle | 0.36.4 + drizzle-kit | Plays nicely with postgres.js + raw SQL when needed |
| DB | Postgres | 16 + **pgvector** | Embeddings live in `articles.embedding vector(1536)` |
| Queue | BullMQ | 5.79.0 + ioredis 5.10.1 (versions **must match**) | Redis-backed, durable, repeatable jobs |
| LLM | OpenAI SDK | 6.44.0 | Used for both chat (enrich) and embeddings |
| TS | strict | 5.7.2 | `noEmit` typecheck step in CI |
| Test | Vitest | 2.1.8 | 36 tests across fetcher/enrich/cluster/queue |

---

## Repo layout

```
ai-radar/
├── app/                              # Next.js routes (App Router)
│   ├── inbox/                        # article list (filterable)
│   ├── sources/                      # source CRUD-lite
│   ├── topics/                       # Topic Radar (clusters)
│   ├── jobs/                         # operational view: fetch_jobs, runs, errors
│   ├── drafts/                       # newsletter drafts (Day 8)
│   ├── api/                          # server routes (currently just /api/sources)
│   └── layout.tsx                    # nav + global shell
│
├── lib/
│   ├── db/
│   │   ├── client.ts                 # postgres.js + drizzle client
│   │   └── schema.ts                 # ALL tables in one file (sources, articles,
│   │                                 # article_insights, topics, topic_articles,
│   │                                 # newsletter_issues, newsletter_issue_items,
│   │                                 # fetch_jobs)
│   ├── fetcher/
│   │   ├── adapters/                 # rss / sitemap / arxiv_api — pluggable per source.type
│   │   ├── dedup.ts                  # URL canonicalize + content hash
│   │   ├── dispatch.ts               # routes Source → adapter
│   │   └── ingest.ts                 # adapter → dedup → insert → log fetch_jobs
│   ├── enrich/
│   │   ├── llm.ts                    # OpenAI client; pipeline-tier model selection
│   │   ├── hydrate.ts                # extracts content from RSS items missing summaries
│   │   └── run.ts                    # enrichPending(): pull pending articles, enrich, write back
│   ├── embed/
│   │   ├── openai.ts                 # embedBatch() — text-embedding-3-large @ 1536d
│   │   └── run.ts                    # embedPending(): batch, write to articles.embedding
│   ├── cluster/
│   │   └── topics.ts                 # UnionFind on cosine similarity > 0.82, last 60d window
│   ├── queue/
│   │   ├── connection.ts             # SEPARATE queue/worker ioredis connections (bullmq req)
│   │   ├── queues.ts                 # typed Queue<T> for fetch/enrich/embed/cluster
│   │   ├── workers.ts                # Worker per queue with bounded concurrency
│   │   └── scheduler.ts              # repeatable-job registrar (per-source fetch)
│   └── seed/
│       └── sources.ts                # initial 12 sources (openai-blog, hf-blog, arxiv-cs-ai, ...)
│
├── workers/                          # standalone CLI entrypoints (tsx)
│   ├── fetch-once.ts                 # `pnpm worker:fetch` — one-shot ingest all sources
│   ├── enrich-once.ts                # `pnpm worker:enrich` — drain enrich pending
│   ├── embed-once.ts                 # `pnpm worker:embed --limit N --batch N`
│   ├── cluster-once.ts               # `pnpm worker:cluster` — re-cluster last 60d
│   └── scheduler.ts                  # `pnpm worker:scheduler` — long-running BullMQ scheduler
│
├── scripts/
│   ├── migrate.ts                    # CREATE EXTENSION vector + drizzle migrate
│   └── seed-sources.ts               # upsert seed sources from lib/seed/
│
├── drizzle/                          # generated migrations (committed)
│   ├── 0000_clever_black_tom.sql
│   └── 0001_abnormal_tempest.sql     # adds articles.embedding vector(1536) + idx
│
├── deploy/helm/ai-radar/             # production Helm chart (PR #6)
├── docker-compose.yml                # local pg (pgvector:pg16, :5433) + redis (:6380)
├── Dockerfile                        # multi-stage, single-image-three-roles
├── .github/workflows/ci.yml          # typecheck + lint + test on every PR + main push
└── docs/mvp-plan.md                  # original 10-day planning doc (1396 lines)
```

---

## Operational state (as of last commit on main)

- **Sources**: 12 enabled (openai-blog 1010 articles, huggingface-blog 803, anthropic-news 50, arxiv-cs-ai 30, arxiv-cs-lg 30, reddit-claudecode 32, steve-yegge-blog 25, anthropic-engineering 25, techcrunch-ai 20, google-ai-blog 20, the-verge-ai 10, mit-tech-review-ai 10).
- **Articles**: ~2,065 fetched; 100% enriched + embedded.
- **Topics**: 10 open clusters at threshold 0.82 (largest: "Introducing Claude Opus 4.8", score 9).
- **Newsletter drafts**: 0 persisted (Day 8 verified E2E then test draft deleted; loop is live).
- **Scheduler defaults** (overridable via env): fetch 30min × per-source × 3 concurrency / enrich+embed 15min × 1 / cluster 60min × 1.
- **Tests**: 69/69 passing (+13 topic actions in PR #10).
- **i18n**: global EN/中文 toggle in topbar (cookie `ai-radar-lang` + `?lang=` URL); `/topics`, `/inbox`, `/drafts`, `/topics/[id]` all bilingual.
- **Topic operations**: `/topics/[id]` detail page with archive (reversible), promote (open↔selected), merge (PK-dedup + recompute), split (refuses to empty source), notes scratchpad. New status vocab: `archived`, `merged`. Topic Radar list now shows `open + selected`, hides merged/archived.
- **Cost reference**: full enrichment run (2023 articles) ~$0.71 on gpt-4o-mini; full embedding run (2058 articles) ~$0.011 on text-embedding-3-large @ 1536d; one newsletter draft ~$0.001 on gpt-5.4-mini (5s, ~9KB markdown).

---

## Conventions an agent must follow

### Code
- **TypeScript strict everywhere.** No `any` without a `// eslint-disable-next-line` + reason.
- **Drizzle for typed queries, raw SQL only when drizzle can't express it** (e.g., pgvector `<=>` operator, LATERAL JOIN top-K NN). When you go raw, use `db.execute(sql\`...\`)` and remember `db.execute()` returns **string** for time columns — wrap with `new Date(...)` before sorting.
- **postgres.js param binding**: `WHERE id = ANY(${ids})` is broken for `text[]`. Use `IN (${sql.join(ids, sql\`, \`)})` or filter by another constraint.
- **No new top-level dependencies without a reason.** Adding a package means bumping the lockfile, the docker image, the CI cache, and the prod surface area.
- **Files under `lib/<domain>/` are colocated with their `.test.ts`.** New code in `lib/foo/` should ship with `lib/foo/foo.test.ts`.
- **Workers are dumb entrypoints.** Logic lives in `lib/<domain>/run.ts`. Workers just call it and exit. Makes them testable + scheduler-callable + CLI-callable.

### Commits + PRs
- **Conventional commit titles**: `feat(<area>): <summary>` / `fix(<area>): ...` / `chore(...)` / `docs(...)`. Body explains *why*, not *what*.
- **Each PR squash-merges and deletes its branch** (`gh pr merge N --squash --delete-branch`). One PR per logical change.
- **PR description should include**: summary, what's in (bullets), validation evidence (test counts, lint result, what you ran), pitfalls captured.
- **Don't commit `Chart.lock` subchart `.tgz` blobs** (gitignored). `Chart.lock` IS committed (pins versions); generated `charts/*.tgz` is not.

### Migrations
- **One drizzle migration per schema change.** Don't combine.
- **`scripts/migrate.ts` runs `CREATE EXTENSION IF NOT EXISTS vector` before drizzle.** Don't bypass it.
- **Migrations are forward-only.** No down migrations. If you mess up, write a new forward migration to fix it.

### LLM / API
- **Default chat model**: `gpt-4o-mini` (override via `OPENAI_ENRICH_MODEL`). LiteLLM gateway works via `OPENAI_BASE_URL`; for that gateway use `gpt-5.4-mini`.
- **Default embedding model**: `text-embedding-3-large` @ `dimensions=1536`. **LiteLLM gateway accepts ONLY this embedding model** — `ada-002` and `text-embedding-3-small` are listed but the `/v1/embeddings` endpoint rejects them.
- **LiteLLM + gpt-5.x forces `temperature=1`.** Don't try to set it lower.

---

## Pitfalls captured (the "don't repeat this" log)

> Every one of these cost real time. They're here so the next session
> doesn't bleed on the same edges.

### Environment
- **postgres.js `WHERE id = ANY($1)` breaks for `text[]`.** Use `IN (...)` lists or redundant WHERE clauses.
- **`db.execute()` returns time fields as strings.** Always `new Date(x)` before sorting / comparing.
- **drizzle has no native `vector` column.** We declare `customType<{ data: number[] }>()` in `lib/db/schema.ts` — copy the pattern for any other unsupported PG type.
- **Next.js 15 typedRoutes rejects dynamic URLs.** Cast: `href={url as never}`. There's an upstream fix landing in 15.2; remove the cast when we upgrade.
- **`tsx` via `pnpm` buffers stdout.** Scheduler logs appear delayed; don't think the process is dead.

### BullMQ
- **`bullmq` and `ioredis` versions must match** (`bullmq@5.79.0` ↔ `ioredis@5.10.1`). Bumping one without the other crashes at startup.
- **`maxRetriesPerRequest: null` is required on ioredis.** BullMQ enforces it.
- **Separate queue and worker ioredis connections.** Sharing one connection causes blocked-command errors. See `lib/queue/connection.ts`.
- **`Queue<T>` generic doesn't survive a factory function.** Each queue needs its own `new Queue<T>(...)` call in `lib/queue/queues.ts`.
- **Scheduler must be singleton.** Repeatable jobs register globally in Redis; two schedulers = double-registration = duplicate cron entries = duplicate cost. K8s scheduler Deployment is hardcoded to `replicas: 1` + `strategy: Recreate`.

### Clustering
- **Cosine threshold matters a lot.** 0.78 over-clusters near-versions (Opus 4.7 + 4.8 + derivatives merge). 0.82 separates them correctly. Don't tune without re-checking real cluster output.
- **60-day clustering window.** Older articles aren't candidates — keeps Topic Radar fresh.
- **Topic write is wipe-and-rewrite per run.** Cluster job MUST be concurrency 1 (`WORKER_CONCURRENCY.cluster: 1`). Race = corrupt topic state.

### Helm / K8s
- **`.helmignore` with `charts/` or `*.tgz` silently filters subchart deps.** Cost ~45min to bisect last time. Do not add those patterns. Captured in the `helm-chart-authoring` skill.
- **Bitnami `postgresql` image override must be at top-level under `postgresql:`, NOT under `primary:`.** Nested override is silently ignored.
- **Bitnami charts block non-Bitnami images by default.** Set `postgresql.global.security.allowInsecureImages: true` when using `pgvector/pgvector:pg16`.
- **Bitnami HTTPS chart repo is deprecated.** Use `oci://registry-1.docker.io/bitnamicharts`. The legacy URL silently redirects but `Chart.lock` digests won't reconcile cleanly.

### GitHub Actions / pnpm
- **pnpm/action-setup@v4 + `version:` field + `packageManager` field in package.json = `ERR_PNPM_BAD_PM_VERSION`.** Drop the `version:` from the action; the action reads `packageManager` automatically. (Fixed in PR #7.)
- **pnpm v11 renamed `onlyBuiltDependencies` → `allowBuilds`** in `pnpm-workspace.yaml`. The v10 key is silently ignored — `pnpm config get` still reads it (misleading), but install behavior doesn't apply it. New syntax is a map, not a list: `allowBuilds: { esbuild: true, sharp: true, ... }`. Without it, CI exits non-zero with `ERR_PNPM_IGNORED_BUILDS`. (Fixed in PR #7.)
- **PR base branch deletion auto-closes the PR.** If you need to retarget, rebase onto the new base and open a fresh PR.

### Next.js 15 — client/server module split
- **A client component (`"use client"`) cannot transitively import `next/headers`.** If `lib/foo.ts` calls `cookies()` and `components/bar.tsx` is `"use client"` and imports anything from `lib/foo`, the whole page 500s with "You're importing a component that needs `next/headers`". Fix: split into `lib/foo.ts` (client-safe types/dicts/pure helpers) and `lib/foo.server.ts` (server-only `cookies()`/`headers()` callers). Server components import from `.server`; client components import only from the
- **Dynamic `router.push(\`/x/${id}\`)` with typedRoutes** needs `as never` cast. (Captured PR #8, reaffirmed PR #9, #10.)

### Drizzle + postgres.js gotchas (PR #10)
- **JS arrays in `sql\`...${ids}::uuid[]\`\` tagged templates become `record`, not `uuid[]`.** postgres.js serializes JS arrays as ROW(...), and PG can't cast a record to a typed array. Symptom: `PostgresError: cannot cast type record to uuid[]`. Fix: use Drizzle's `inArray(col, ids)` for WHERE clauses, or `sql.join(ids.map((id) => sql\`${id}::uuid\`), sql\`, \`)` to build a real IN list.
- **`min()`/`max()` on a `timestamp with time zone` column** returns a value that Drizzle's `PgTimestamp.mapToDriverValue` later tries to encode by calling `.toISOString()`, which crashes with `value.toISOString is not a function`. Symptom: any UPDATE that writes the aggregate back into a timestamp column fails. Fix: cast in SQL — `sql<string | null>\`min(${col})::text\`` — then `new Date(str)` in JS before writing.
- **Integration tests need `.env` loaded explicitly.** `vitest.config.ts` now `import { config } from "dotenv"` + `loadEnv()` so tests with live DB calls work via `pnpm test`. Tests gate on `process.env.DATABASE_URL` and skip cleanly on CI.

---

## How to run things

### One-shots (for debugging / catch-up after downtime)
```bash
pnpm worker:fetch                                  # all 12 sources, one pass
pnpm worker:enrich                                 # drain enrich-pending
pnpm worker:embed --limit 2500 --batch 64          # drain embed-pending
pnpm worker:cluster                                # re-cluster open topics
```

### Long-running pipeline (local)
```bash
pnpm worker:scheduler              # registers repeatable jobs + spawns 4 workers
# Override intervals:
FETCH_INTERVAL_MS=600000 pnpm worker:scheduler     # fetch every 10min
```

### Validation before commit
```bash
pnpm typecheck    # tsc --noEmit, ~5s
pnpm lint         # next lint, ~3s
pnpm test         # vitest run, 36 tests, ~7s
```

### Pre-deploy checks (Helm)
```bash
cd deploy/helm/ai-radar
helm dependency build
helm lint . --set secrets.openaiApiKey=sk-test
helm template test . --set secrets.openaiApiKey=sk-test > /tmp/render.yaml
```

---

## Next milestones (the "what's coming" so you don't break in-flight work)

**Day 8 (done — PR #8)**: Newsletter draft generator at `/drafts`.
- Reads top N topics in window by `final_score`, buckets into 4 sections (top_stories / infra_watch / research / quick_hits).
- LLM (gpt-4o-mini / gpt-5.4-mini via LiteLLM) writes section blurbs + title + subject in JSON-schema mode; markdown is assembled deterministically.
- Persists to `newsletter_issues` (+ items per article) in a single transaction.
- Editor at `/drafts/[id]` with bilingual title/subject fields, markdown source + live preview, save, status toggle (draft/published), copy/download .md, mailto handoff, delete.
- `POST /api/drafts` (generate), `GET /api/drafts` (list), `GET/PATCH/DELETE /api/drafts/[id]`.
- E2E verified 2026-06-23: generated a bilingual draft from 7-day window, 9.9KB markdown, 5s latency on gpt-5.4-mini.

**Day 9 (done — PR #9)**: global bilingual UI.
- `lib/i18n.ts` (client-safe: type/cookie/STRINGS/`t()`/`pickBilingual`) + `lib/i18n.server.ts` (server-only `resolveLang` reading cookies).
- `components/lang-toggle.tsx` in topbar writes 1y cookie + `?lang=` URL, `router.refresh()`.
- All server pages call `resolveLang(searchParams)` — URL wins, cookie sticky, default EN.
- Per-page lang TabLinks deleted from `/topics` and `/inbox` (global only now).
- `<html lang>` switches to `zh-CN` / `en`.

**Day 9.5 (PR #10) — Topic detail + operations**
- `/topics/[id]`: server-rendered detail with members list, status pill, score badges, notes scratchpad.
- Four mutation actions wired to dedicated API routes:
  - `POST /api/topics/[id]/archive` + `DELETE` for unarchive — reversible.
  - `POST /api/topics/[id]/promote` — toggles `open ↔ selected`.
  - `POST /api/topics/merge` `{survivorId, mergedIds[]}` — PK-dedup memberships, marks losers `status=merged + merged_into_id`, recomputes survivor aggregates.
  - `POST /api/topics/[id]/split` `{articleIds[], newTitleEn?}` — spins subset into new `open` topic; refuses `WOULD_EMPTY_TOPIC`.
  - `POST /api/topics/[id]/notes` — free-form text, trims to NULL on blank.
- Schema migration 0002: `topics.merged_into_id` (uuid, indexed) + `topics.notes` (text). Status vocab extended with `archived` and `merged`.
- `/topics` list now filters to `open + selected` (hides merged/archived); shows blue "selected" pill + per-row "detail →" link.
- Pure logic in `lib/topics/actions.ts` with `TopicActionError(code, message)` for stable 4xx mapping in routes.
- 13 integration tests against live local Postgres (skip gracefully when `DATABASE_URL` absent).

**Day 10 (next)**: production deploy — push image to GHCR, helm install on cluster, point a domain.

**Backlog**:
- Topic detail page (`/topics/[id]`) with merge/split/promote actions.
- Inbox source/category filter + article detail drawer.
- Manual job trigger UI on `/jobs` (currently read-only).
- Auth (everything is currently open; fine for solo MVP).

---

## When you (the agent) finish a meaningful change

1. Update this file's "Operational state" + "Pitfalls captured" + "Next milestones" sections.
2. Bump `Chart.yaml` `version:` if Helm chart shape changed; bump `appVersion:` if image semantics changed.
3. Make sure CI is green before merging (`gh pr checks <N> --watch`).
4. Squash-merge with `--delete-branch`.

If you discover a pitfall not listed here, **add it before closing the session.** Future-you will thank you.
