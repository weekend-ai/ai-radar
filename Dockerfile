# Multi-stage build:
#   1) deps    — install pnpm deps with cached pnpm store
#   2) builder — typecheck + next build (produces .next/standalone)
#   3) runner  — slim image with only what's needed at runtime
#
# Single image runs BOTH roles:
#   - Web:       CMD ["node", "server.js"]                     (default)
#   - Scheduler: CMD ["node", "--import", "tsx/esm", "workers/scheduler.ts"]
#   - Migrate:   CMD ["node", "--import", "tsx/esm", "scripts/migrate.ts"]
#
# k8s Deployments override `command`/`args` to pick the role.

# ------------------------------------------------------------
ARG NODE_VERSION=22-alpine

# ─── Stage 1: deps ─────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# pnpm via corepack (ships with node)
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --frozen-lockfile is strict — fails if lockfile drift; --prod=false because we
# need devDeps (drizzle-kit, typescript) at build time
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ─── Stage 2: builder ──────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env: Next.js inlines NEXT_PUBLIC_* at this step, so any client-side
# env must be passed via --build-arg. Server-side env reads at runtime in pods.
ENV NEXT_TELEMETRY_DISABLED=1

# Skip typecheck here — we typecheck in CI before pushing the image.
RUN pnpm build

# ─── Stage 3: runner ───────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user (matches Next.js standalone defaults)
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Next standalone bundle: server.js + minimal node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# For scheduler + migrate roles we need the full source + tsx loader + drizzle.
# The standalone build doesn't include workers/* or scripts/*, so copy them
# alongside. tsx is in node_modules already because we copy it below.
COPY --from=builder --chown=nextjs:nodejs /app/workers ./workers
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
# tsx + drizzle-kit live in node_modules — copy the relevant subtrees only
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000

# Default: web role. Scheduler / migrate roles override via k8s deployment.
CMD ["node", "server.js"]
