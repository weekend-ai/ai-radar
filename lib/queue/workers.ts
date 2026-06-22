/**
 * BullMQ workers — one per queue. Each consumes from its queue and runs the
 * corresponding pipeline stage.
 *
 * All workers share concurrency policy via the `WORKER_CONCURRENCY` map:
 *   - fetch:   3   (RSS fetches are I/O bound, safe to parallelize)
 *   - enrich:  1   (LLM cost control + rate limit awareness)
 *   - embed:   1   (single batch already parallelizes internally)
 *   - cluster: 1   (must be singleton — wipes + rewrites topics table)
 */

import { Worker, type Job } from "bullmq";
import { getWorkerConnection } from "./connection";
import {
  QUEUES,
  QUEUE_PREFIX,
  type FetchJobData,
  type EnrichJobData,
  type EmbedJobData,
  type ClusterJobData,
} from "./queues";
import { db } from "@/lib/db/client";
import { sources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ingestSource } from "@/lib/fetcher/ingest";
import { enrichPending } from "@/lib/enrich/run";
import { embedPending } from "@/lib/embed/run";
import { runClustering } from "@/lib/cluster/topics";

export const WORKER_CONCURRENCY = {
  fetch: 3,
  enrich: 1,
  embed: 1,
  cluster: 1,
} as const;

function makeWorker<T>(
  name: string,
  processor: (job: Job<T>) => Promise<unknown>,
  concurrency: number
): Worker<T> {
  const worker = new Worker<T>(name, processor, {
    connection: getWorkerConnection(),
    prefix: QUEUE_PREFIX,
    concurrency,
  });
  worker.on("completed", (job) => {
    console.log(`[${name}] ✓ job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[${name}] ✗ job ${job?.id} failed:`, err.message);
  });
  worker.on("error", (err) => {
    console.error(`[${name}] worker error:`, err.message);
  });
  return worker;
}

/**
 * Boot all workers. Returns an array so the scheduler can close them on
 * shutdown.
 */
export function startWorkers(): Worker[] {
  const fetchWorker = makeWorker<FetchJobData>(
    QUEUES.FETCH,
    async (job) => {
      const { sourceId } = job.data;
      const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
      if (!source) throw new Error(`source ${sourceId} not found`);
      if (!source.enabled) {
        return { skipped: true, reason: "disabled" };
      }
      const result = await ingestSource(source, "scheduler");
      console.log(
        `[fetch] ${sourceId}: fetched=${result.fetched} new=${result.inserted} dup=${result.duplicates}`
      );
      return result;
    },
    WORKER_CONCURRENCY.fetch
  );

  const enrichWorker = makeWorker<EnrichJobData>(
    QUEUES.ENRICH,
    async (job) => {
      const limit = job.data.limit ?? 50;
      const maxTier = job.data.maxTier ?? 3;
      const s = await enrichPending({ limit, maxTier });
      console.log(
        `[enrich] enriched=${s.enriched} failed=${s.failed} cost=$${s.estCostUsd.toFixed(4)}`
      );
      return s;
    },
    WORKER_CONCURRENCY.enrich
  );

  const embedWorker = makeWorker<EmbedJobData>(
    QUEUES.EMBED,
    async (job) => {
      const limit = job.data.limit ?? 200;
      const s = await embedPending({ limit });
      console.log(
        `[embed] embedded=${s.embedded} failed=${s.failed} cost=$${s.estCostUsd.toFixed(4)}`
      );
      return s;
    },
    WORKER_CONCURRENCY.embed
  );

  const clusterWorker = makeWorker<ClusterJobData>(
    QUEUES.CLUSTER,
    async () => {
      const s = await runClustering({});
      console.log(
        `[cluster] topics=${s.topicsCreated} assignments=${s.articleAssignments} largest=${s.largestTopic}`
      );
      return s;
    },
    WORKER_CONCURRENCY.cluster
  );

  return [fetchWorker, enrichWorker, embedWorker, clusterWorker];
}
