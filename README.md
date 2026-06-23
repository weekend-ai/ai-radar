# AI Radar

> AI intelligence radar & newsletter generator — fetches multi-source AI signals,
> dedupes, scores, clusters into topics, and drafts bilingual newsletters.

[![CI](https://github.com/weekend-ai/ai-radar/actions/workflows/ci.yml/badge.svg)](https://github.com/weekend-ai/ai-radar/actions/workflows/ci.yml)

```
RSS / sitemap / arxiv
        │
        ▼
   ingest + dedup
        │
        ▼
  LLM enrich (score + summary + tags)
        │
        ▼
  embed (text-embedding-3-large @ 1536d)
        │
        ▼
  cluster (cosine UnionFind → topics)
        │
        ▼
  /inbox  /topics  /drafts
```

**Current state**: scheduler-driven pipeline + Topic Radar UI working end-to-end (~2k articles, 100% enriched + embedded, 10 open topic clusters). Day 8 (newsletter drafts) up next.

For agent-style context (conventions, pitfalls, current op state), see [`CLAUDE.md`](./CLAUDE.md).
For the original plan, see [`docs/mvp-plan.md`](./docs/mvp-plan.md).

---

## Table of contents

- [Stack](#stack)
- [Local development](#local-development)
- [Configuration reference](#configuration-reference)
- [Operating the pipeline](#operating-the-pipeline)
- [Kubernetes deployment](#kubernetes-deployment)
- [Testing & CI](#testing--ci)
- [License](#license)

---

## Stack

- **Next.js 15** (App Router, typedRoutes) + React 19 + Tailwind 3.4
- **TypeScript** strict
- **Postgres 16** + **pgvector** (embeddings + cosine NN)
- **Drizzle ORM** + `drizzle-kit`
- **Redis** + **BullMQ** (durable job queue + repeatable scheduler)
- **OpenAI SDK** (chat + embeddings; works with any OpenAI-compatible gateway — LiteLLM, Azure, OpenRouter)
- **pnpm** (lockfile-pinned; `packageManager: pnpm@11.8.0`)

Fetch adapters are pluggable per `source.type`:

| Adapter | When to use |
|---|---|
| `rss` | Generic RSS/Atom feed (most blogs) |
| `sitemap` | Sites with no RSS, e.g. Anthropic — uses `sitemap.xml` + URL prefix filter |
| `arxiv_api` | The official arXiv Atom API with built-in rate limiting |

Adding a new source type means dropping a file in `lib/fetcher/adapters/` that implements the `FetchAdapter` interface in `lib/fetcher/types.ts`.

---

## Local development

### Prerequisites

- Node **22.x** (use [asdf](https://asdf-vm.com/) or [nvm](https://github.com/nvm-sh/nvm))
- pnpm **11.8.0** (`corepack enable && corepack prepare pnpm@11.8.0 --activate`)
- Docker + docker compose
- An OpenAI API key (or any OpenAI-compatible gateway endpoint)

### Five-step quick start

```bash
# 1. install deps
pnpm install

# 2. start postgres + redis (postgres on :5433, redis on :6380)
docker compose up -d

# 3. configure env
cp .env.example .env
# set OPENAI_API_KEY at minimum; everything else has a working default

# 4. migrate schema (creates pgvector extension + tables) + seed sources
pnpm db:migrate
pnpm db:seed

# 5. boot the app + worker(s)
pnpm dev                      # in one terminal — Next dev server on :3000
pnpm worker:scheduler         # in another — runs the full pipeline forever
```

Open <http://localhost:3000>. Within ~2 minutes the scheduler will fetch its first articles and the Inbox will fill up. Watch progress at `/jobs`.

### Or, run the pipeline manually (no scheduler)

Useful when you're hacking on a single stage and don't want background activity:

```bash
pnpm worker:fetch     # one pass over all sources
pnpm worker:enrich    # drain enrich-pending (LLM call per article)
pnpm worker:embed     # drain embed-pending
pnpm worker:cluster   # rebuild topic clusters from the last 60 days
```

### Useful day-to-day commands

```bash
pnpm dev              # Next dev server (HMR)
pnpm typecheck        # tsc --noEmit
pnpm lint             # next lint
pnpm test             # vitest run (36 tests, ~7s)
pnpm db:studio        # drizzle-kit studio — visual DB inspector on :4983
pnpm db:generate      # generate a new migration after schema.ts changes
```

### Common dev hiccups

| Symptom | Fix |
|---|---|
| `pnpm install` fails with `ERR_PNPM_BAD_PM_VERSION` | You're not on pnpm 11.8.0. Run `corepack prepare pnpm@11.8.0 --activate`. |
| Scheduler logs are empty | `tsx` via `pnpm` buffers stdout. The process IS running; check `pnpm exec ps` or query `fetch_jobs` table. |
| `db:migrate` fails with `permission denied to create extension "vector"` | Your postgres role isn't superuser. The docker-compose default user is — verify you're hitting `localhost:5433`, not a different DB. |
| `/topics` is empty | Articles need to be enriched + embedded before clustering runs. Run `pnpm worker:enrich && pnpm worker:embed && pnpm worker:cluster` once. |
| LiteLLM gateway returns 400 on embed | LiteLLM's `/v1/embeddings` only accepts `text-embedding-3-large`. Leave `OPENAI_EMBED_MODEL` unset to use the default. |

---

## Configuration reference

All config is via env vars. Defaults in `.env.example`.

### Required

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `postgres://USER:PASS@HOST:PORT/DB` — must point at a Postgres with pgvector available |
| `REDIS_URL` | `redis://HOST:PORT` (with `:PASS@` if auth enabled) |
| `OPENAI_API_KEY` | Or your gateway's key |

### Optional

| Variable | Default | Notes |
|---|---|---|
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Use your LiteLLM / Azure / OpenRouter URL |
| `OPENAI_ENRICH_MODEL` | `gpt-4o-mini` | For LiteLLM gateway try `gpt-5.4-mini` |
| `OPENAI_EMBED_MODEL` | `text-embedding-3-large` | LiteLLM gateway: leave default |
| `OPENAI_EMBED_DIMENSIONS` | `1536` | We truncate from 3072; matches `articles.embedding vector(1536)` |
| `FETCH_INTERVAL_MS` | `1800000` (30 min) | Scheduler only |
| `ENRICH_INTERVAL_MS` | `900000` (15 min) | Scheduler only |
| `EMBED_INTERVAL_MS` | `900000` (15 min) | Scheduler only |
| `CLUSTER_INTERVAL_MS` | `3600000` (60 min) | Scheduler only |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Used in absolute links / canonical URLs |

---

## Operating the pipeline

### Sources

Defined in `lib/seed/sources.ts`, materialized into DB on `pnpm db:seed`. To add a source today, edit that file and re-seed (it upserts by `slug`).

A proper sources-management UI is on the backlog — see `CLAUDE.md` → "Next milestones".

### Cost reference (real, not estimated)

- **Enrichment**: ~$0.35 per 1k articles on `gpt-4o-mini` (2.2M tokens for 2023 articles → $0.71 total).
- **Embedding**: ~$0.005 per 1k articles on `text-embedding-3-large` @ 1536d (85K tokens for 2058 articles → $0.011 total).

Pipeline at default cadence (~12 sources × every 30min) sustains <$1/month in inference cost.

### Observability

- **`/jobs` page** — system totals (articles / enriched / embedded / topics / runs in last 24h / errors / success rate) + per-source breakdown + last 50 fetch_jobs.
- **`fetch_jobs` table** — every fetch attempt logs `started_at`, `finished_at`, `status`, `articles_inserted`, `error`. Query directly for ops debugging.
- **BullMQ Redis keys** — `KEYS ai-radar:*` shows queue depth + worker locks.

---

## Kubernetes deployment

A production-ready Helm chart lives at [`deploy/helm/ai-radar/`](./deploy/helm/ai-radar/) (see its [README](./deploy/helm/ai-radar/README.md) for the full reference). Below is the typical first deploy.

### What gets deployed

| Workload | Count | Purpose |
|---|---|---|
| `web` Deployment + Service | 2 replicas (HPA-able) | Next.js standalone server |
| `scheduler` Deployment | **1 replica, `Recreate` strategy** | BullMQ worker pool + repeatable-job registrar |
| `migrate` Job | Helm pre-install/upgrade hook | `CREATE EXTENSION vector` + drizzle migrate |
| Postgres StatefulSet | 1, 20Gi PVC | Bitnami subchart, uses `pgvector/pgvector:pg16` image |
| Redis StatefulSet | 1, 2Gi PVC | Bitnami subchart, standalone |
| Secret | 1 | OpenAI key + auto-wired `DATABASE_URL`/`REDIS_URL` |
| Ingress (optional) | 1 | Toggle with `ingress.enabled=true` |

All three app roles run from the **same image** — k8s Deployments pick the role via `command`/`args`.

### One-time prerequisites

- Kubernetes 1.27+
- Helm **3.14+** (3.18+ recommended)
- A container registry the cluster can pull from (default in the chart is `ghcr.io/weekend-ai/ai-radar`)
- Optional: `ingress-nginx` + `cert-manager` for TLS

### Build & push the image

```bash
# From the repo root, build for the cluster's architecture
docker build -t ghcr.io/weekend-ai/ai-radar:0.1.0 .

# Push (you'll need a GHCR PAT with write:packages scope, or use ECR/GCR/etc.)
docker push ghcr.io/weekend-ai/ai-radar:0.1.0
```

### Install

```bash
# Fetch subchart deps (postgresql + redis from Bitnami OCI registry)
helm dependency build deploy/helm/ai-radar

# Install (creates namespace, runs migrate Job, brings up pods)
helm upgrade --install ai-radar deploy/helm/ai-radar \
  --namespace ai-radar --create-namespace \
  --set secrets.openaiApiKey=sk-... \
  --set image.tag=0.1.0
```

The `pre-install` migration Job runs first, waits for postgres to be reachable, enables pgvector, applies all drizzle migrations, then web + scheduler come up.

### Verify

```bash
# Migration ran?
kubectl -n ai-radar logs -l app.kubernetes.io/component=migrate --tail=200

# Pods up?
kubectl -n ai-radar get pods

# Tail scheduler (shows fetch/enrich/embed/cluster activity)
kubectl -n ai-radar logs -l app.kubernetes.io/component=scheduler -f

# Port-forward web for local check (skip if you've configured ingress)
kubectl -n ai-radar port-forward svc/ai-radar-web 8080:80
open http://localhost:8080
```

### Common deploy overrides

```bash
# Use a LiteLLM / Azure / OpenRouter gateway
--set secrets.openaiBaseUrl=https://litellm.example.com/v1

# Use managed DBs (Neon / Supabase / RDS / ElastiCache / Upstash)
--set postgresql.enabled=false --set redis.enabled=false \
--set secrets.databaseUrlOverride='postgres://USER:PASS@HOST:5432/DB' \
--set secrets.redisUrlOverride='rediss://:PASS@HOST:6380'

# Expose via ingress with TLS
--set ingress.enabled=true \
--set ingress.hosts[0].host=ai-radar.example.com \
--set 'ingress.annotations.cert-manager\.io/cluster-issuer=letsencrypt-prod' \
--set 'ingress.tls[0].secretName=ai-radar-tls' \
--set 'ingress.tls[0].hosts[0]=ai-radar.example.com'

# Tune scheduler cadence
--set 'scheduler.extraEnv[0].name=FETCH_INTERVAL_MS' \
--set 'scheduler.extraEnv[0].value=600000'
```

For managed Postgres, the `vector` extension must be installable on the server. Neon and RDS PG16 both support it. The migrate Job runs `CREATE EXTENSION IF NOT EXISTS vector` — this needs SUPERUSER on the role or that the cloud provider has whitelisted `vector` in their trusted extensions list.

### Why the scheduler is special

BullMQ's repeatable jobs are registered globally in Redis. Two scheduler pods would double-register every cron entry and double cost + create duplicate articles. So the chart hardcodes:

- `replicas: 1` — do not change
- `strategy: Recreate` — kill the old pod before starting the new one (no overlap during a rollout)

If you ever need HA for the scheduler, the right fix is **Redis-based leader election in `workers/scheduler.ts`**, not adding replicas here. That's not on the MVP roadmap.

### Upgrades

```bash
docker build -t ghcr.io/weekend-ai/ai-radar:0.2.0 . && docker push !$
helm upgrade ai-radar deploy/helm/ai-radar -n ai-radar \
  --reuse-values --set image.tag=0.2.0
```

`pre-upgrade` migration Job runs automatically. Scheduler has a brief gap during the rollout (intentional, see above).

For the full chart reference (every value, every pitfall, the validation loop), see [`deploy/helm/ai-radar/README.md`](./deploy/helm/ai-radar/README.md).

---

## Testing & CI

- **Vitest**: 36 tests across `lib/fetcher/dedup` (9), `lib/fetcher/sitemap` (4), `lib/fetcher/arxiv` (1), `lib/enrich/hydrate` (9), `lib/cluster/topics` (6), `lib/queue/queues` (7). Pure unit tests, no DB or network.
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): runs `pnpm typecheck` + `pnpm lint` + `pnpm test` on every push to `main` and every PR.

Run locally:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

## License

MIT — see [`LICENSE`](./LICENSE).
