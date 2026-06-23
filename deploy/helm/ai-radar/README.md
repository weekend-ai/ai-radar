# AI Radar — Kubernetes deployment

A Helm chart for deploying [AI Radar](https://github.com/weekend-ai/ai-radar) to Kubernetes.

## What it ships

| Component | Workload | Notes |
|---|---|---|
| `web` | `Deployment` (default 2 replicas) + `Service` + optional `HPA` + optional `Ingress` | Next.js standalone server on port 3000 |
| `scheduler` | `Deployment` (**always 1 replica**, `Recreate` strategy) | BullMQ workers + repeatable job registrar; double-running causes duplicate cron entries |
| `migrate` | `Job` (Helm `pre-install` + `pre-upgrade` hook) | Runs `drizzle-kit migrate` + `CREATE EXTENSION vector` against postgres before each rollout |
| `postgresql` | Bitnami `postgresql` subchart with **pgvector image** | 20 Gi PVC, single primary, pgvector extension required |
| `redis` | Bitnami `redis` subchart, standalone | 2 Gi PVC, BullMQ backing store |
| `secret` | `Secret` | `OPENAI_API_KEY`, `DATABASE_URL`, `REDIS_URL`, model overrides |

All three app roles run from the **same image** (`ghcr.io/weekend-ai/ai-radar`) — the deployment chooses the role via `command` / `args`.

## Prerequisites

- Kubernetes 1.27+
- Helm 3.14+ (3.18+ recommended)
- A container registry the cluster can pull from (defaults to `ghcr.io/weekend-ai/ai-radar`)
- An OpenAI-compatible API key (OpenAI, LiteLLM gateway, Azure OpenAI, etc.)
- For ingress: `ingress-nginx` (or any controller you wire in) + optionally `cert-manager` for TLS

## Build & push the image

From the repo root:

```bash
# Build for the cluster's architecture
docker build -t ghcr.io/weekend-ai/ai-radar:0.1.0 .

# Push
docker push ghcr.io/weekend-ai/ai-radar:0.1.0
```

Tag whatever you want; just match it on `--set image.tag=...` at install time.

## Install

```bash
# 1. Add bitnami's OCI registry isn't needed — Chart.yaml uses oci:// directly.
#    Just build deps once per chart-version change:
helm dependency build deploy/helm/ai-radar

# 2. Install
helm upgrade --install ai-radar deploy/helm/ai-radar \
  --namespace ai-radar --create-namespace \
  --set secrets.openaiApiKey=sk-... \
  --set image.tag=0.1.0
```

The `pre-install` migration Job runs first, waits for postgres to be reachable, enables pgvector, applies all drizzle migrations, then web + scheduler come up.

### Common overrides

```bash
# Use LiteLLM gateway instead of OpenAI
--set secrets.openaiBaseUrl=https://litellm.example.com/v1

# Pin pipeline cadence (defaults inside lib/queue/scheduler.ts)
--set 'scheduler.extraEnv[0].name=FETCH_INTERVAL_MS' \
--set 'scheduler.extraEnv[0].value=1800000'

# Expose via ingress
--set ingress.enabled=true \
--set ingress.hosts[0].host=ai-radar.example.com \
--set 'ingress.tls[0].secretName=ai-radar-tls' \
--set 'ingress.tls[0].hosts[0]=ai-radar.example.com'

# Use managed postgres/redis (Neon, RDS, ElastiCache, Upstash, etc.)
--set postgresql.enabled=false --set redis.enabled=false \
--set secrets.databaseUrlOverride='postgres://USER:PASS@HOST:5432/DB' \
--set secrets.redisUrlOverride='rediss://:PASS@HOST:6380'
```

Note for **managed Postgres**: pgvector must be installable on the server. Neon and RDS Postgres 16 support it. The migrate Job runs `CREATE EXTENSION IF NOT EXISTS vector` — this requires either SUPERUSER on the role or that the cloud provider has whitelisted vector in their trusted extensions.

### Pre-existing secret

If you're managing secrets with `external-secrets` or `sealed-secrets`:

```bash
--set secrets.create=false \
--set secrets.existingSecretName=ai-radar-prod-secrets
```

The Secret must contain exactly these keys: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_ENRICH_MODEL`, `OPENAI_EMBED_MODEL`, `OPENAI_EMBED_DIMENSIONS`, `DATABASE_URL`, `REDIS_URL`.

## Verify

```bash
# Migration ran?
kubectl -n ai-radar get jobs -l app.kubernetes.io/component=migrate
kubectl -n ai-radar logs -l app.kubernetes.io/component=migrate --tail=200

# Pods up?
kubectl -n ai-radar get pods

# Tail scheduler (shows fetch/enrich/embed/cluster job activity)
kubectl -n ai-radar logs -l app.kubernetes.io/component=scheduler -f

# Port-forward web for local check
kubectl -n ai-radar port-forward svc/ai-radar-web 8080:80
open http://localhost:8080
```

## Upgrade

```bash
docker build -t ghcr.io/weekend-ai/ai-radar:0.2.0 . && docker push !$
helm upgrade ai-radar deploy/helm/ai-radar -n ai-radar \
  --reuse-values --set image.tag=0.2.0
```

`pre-upgrade` migration Job runs automatically. Scheduler is `Recreate` strategy — there will be a brief gap where no scheduler is running (intentional — see below).

## Why the scheduler is special

BullMQ's `repeatable jobs` are registered globally in Redis. If two scheduler pods run at once, **every** cron-style fetch job gets registered twice and runs twice, doubling cost and creating duplicate articles. So:

- `replicas: 1` — never change this
- `strategy: Recreate` — kill the old pod before the new one starts (no overlap)
- `extraEnv` overrides intervals if you need to tune fetch cadence per environment

If you ever need HA for the scheduler, the right answer is **leader election via a Redis lock** in `workers/scheduler.ts`, not adding replicas here.

## Gotchas / pitfalls captured here

| Gotcha | Fix |
|---|---|
| `helm template` says "missing in charts/ directory" even though `.tgz` is right there | Don't put `charts/` or `*.tgz` in `.helmignore` — Helm uses it during chart loading too |
| Bitnami chart now refuses non-Bitnami images | `postgresql.global.security.allowInsecureImages: true` (we're using `pgvector/pgvector:pg16`) |
| Bitnami `image:` override ignored when nested under `primary:` | Must be top-level under `postgresql:` |
| `pg_dump` / pgvector requires SUPERUSER for `CREATE EXTENSION` | Set `postgresql.auth.postgresPassword` AND let migrate run as the postgres superuser (managed DBs: ask provider to enable the `vector` extension) |
| Old `https://charts.bitnami.com/bitnami` repo URL is deprecated and won't match `Chart.lock` digests cleanly | Use `oci://registry-1.docker.io/bitnamicharts` (already done in `Chart.yaml`) |

## Local validation before pushing changes

```bash
cd deploy/helm/ai-radar
helm dependency build
helm lint . --set secrets.openaiApiKey=sk-test
helm template test . --set secrets.openaiApiKey=sk-test | kubectl apply --dry-run=client -f -
```
