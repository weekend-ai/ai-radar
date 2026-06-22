/**
 * Repeat-job registration. Sets up cron-style recurring jobs on each queue.
 *
 * BullMQ "repeatable jobs" are stored in Redis with a stable key derived from
 * the (name, data, pattern). Adding the same repeat config is idempotent —
 * BullMQ will not duplicate it. Removing old repeatables on boot keeps the
 * Redis state in sync if we change the schedule.
 *
 * Schedules:
 *   - fetch: every 30min, one job per enabled source
 *   - enrich/embed: every 15min, drain pending
 *   - cluster: every 60min, singleton recluster
 *
 * Override with env vars:
 *   FETCH_INTERVAL_MS, ENRICH_INTERVAL_MS, EMBED_INTERVAL_MS, CLUSTER_INTERVAL_MS
 */

import { db } from "@/lib/db/client";
import { sources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchQueue, enrichQueue, embedQueue, clusterQueue } from "./queues";

export const SCHEDULES = {
  FETCH_INTERVAL_MS: parseInt(process.env.FETCH_INTERVAL_MS ?? String(30 * 60 * 1000), 10),
  ENRICH_INTERVAL_MS: parseInt(process.env.ENRICH_INTERVAL_MS ?? String(15 * 60 * 1000), 10),
  EMBED_INTERVAL_MS: parseInt(process.env.EMBED_INTERVAL_MS ?? String(15 * 60 * 1000), 10),
  CLUSTER_INTERVAL_MS: parseInt(process.env.CLUSTER_INTERVAL_MS ?? String(60 * 60 * 1000), 10),
} as const;

/**
 * Wipe existing repeat jobs and re-register from current source list.
 * Idempotent — safe to call on every boot.
 */
export async function registerSchedules(): Promise<{
  fetchJobs: number;
  enrichEvery: number;
  embedEvery: number;
  clusterEvery: number;
}> {
  // Clear stale repeatables first (in case sources were removed or schedule changed)
  await clearRepeatables();

  // 1) Fetch — one repeatable per enabled source
  const enabledSources = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.enabled, true));

  for (const src of enabledSources) {
    await fetchQueue().add(
      `fetch-${src.id}`,
      { sourceId: src.id },
      {
        repeat: { every: SCHEDULES.FETCH_INTERVAL_MS },
        jobId: `repeat:fetch:${src.id}`,
      }
    );
  }

  // 2) Enrich
  await enrichQueue().add(
    "enrich-pending",
    { limit: 50 },
    {
      repeat: { every: SCHEDULES.ENRICH_INTERVAL_MS },
      jobId: "repeat:enrich",
    }
  );

  // 3) Embed
  await embedQueue().add(
    "embed-pending",
    { limit: 200 },
    {
      repeat: { every: SCHEDULES.EMBED_INTERVAL_MS },
      jobId: "repeat:embed",
    }
  );

  // 4) Cluster
  await clusterQueue().add(
    "recluster",
    {},
    {
      repeat: { every: SCHEDULES.CLUSTER_INTERVAL_MS },
      jobId: "repeat:cluster",
    }
  );

  return {
    fetchJobs: enabledSources.length,
    enrichEvery: SCHEDULES.ENRICH_INTERVAL_MS,
    embedEvery: SCHEDULES.EMBED_INTERVAL_MS,
    clusterEvery: SCHEDULES.CLUSTER_INTERVAL_MS,
  };
}

async function clearRepeatables() {
  const queues = [fetchQueue(), enrichQueue(), embedQueue(), clusterQueue()];
  for (const q of queues) {
    const repeatable = await q.getRepeatableJobs();
    for (const r of repeatable) {
      await q.removeRepeatableByKey(r.key);
    }
  }
}

/**
 * Trigger immediate one-off jobs for the full pipeline. Useful for boot
 * (so we don't have to wait 15+ minutes for the first cycle) or manual
 * "run now" actions from the admin UI later.
 */
export async function triggerImmediatePipeline(): Promise<void> {
  const enabledSources = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.enabled, true));
  for (const src of enabledSources) {
    await fetchQueue().add(`fetch-${src.id}-boot`, { sourceId: src.id });
  }
}
