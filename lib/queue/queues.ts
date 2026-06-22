/**
 * Queue definitions. One queue per pipeline stage.
 *
 * Naming: kebab-case, prefixed with "ai-radar:" so a shared Redis can host
 * multiple apps without collision.
 *
 * Job data shape:
 *   fetch      → { sourceId: string }       — one job per source
 *   enrich     → { limit?: number }         — drain-pending job
 *   embed      → { limit?: number }         — drain-pending job
 *   cluster    → {}                          — singleton recluster
 *
 * Job names should match the queue name for clarity in dashboards.
 */

import { Queue, type JobsOptions } from "bullmq";
import { getQueueConnection } from "./connection";

export const QUEUE_PREFIX = "ai-radar";

// Queue names — single source of truth, reused across queues.ts, workers.ts, scheduler.ts
export const QUEUES = {
  FETCH: "fetch",
  ENRICH: "enrich",
  EMBED: "embed",
  CLUSTER: "cluster",
} as const;

export type FetchJobData = { sourceId: string };
export type EnrichJobData = { limit?: number; maxTier?: number };
export type EmbedJobData = { limit?: number };
export type ClusterJobData = Record<string, never>;

// Common defaults for all jobs — short retention so Redis stays small,
// 3 retries with exponential backoff for transient failures.
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { age: 24 * 3600, count: 200 },
  removeOnFail: { age: 7 * 24 * 3600, count: 100 },
};

let _fetchQueue: Queue<FetchJobData> | null = null;
let _enrichQueue: Queue<EnrichJobData> | null = null;
let _embedQueue: Queue<EmbedJobData> | null = null;
let _clusterQueue: Queue<ClusterJobData> | null = null;

export function fetchQueue(): Queue<FetchJobData> {
  if (!_fetchQueue) {
    _fetchQueue = new Queue<FetchJobData>(QUEUES.FETCH, {
      connection: getQueueConnection(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return _fetchQueue;
}
export function enrichQueue(): Queue<EnrichJobData> {
  if (!_enrichQueue) {
    _enrichQueue = new Queue<EnrichJobData>(QUEUES.ENRICH, {
      connection: getQueueConnection(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return _enrichQueue;
}
export function embedQueue(): Queue<EmbedJobData> {
  if (!_embedQueue) {
    _embedQueue = new Queue<EmbedJobData>(QUEUES.EMBED, {
      connection: getQueueConnection(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return _embedQueue;
}
export function clusterQueue(): Queue<ClusterJobData> {
  if (!_clusterQueue) {
    _clusterQueue = new Queue<ClusterJobData>(QUEUES.CLUSTER, {
      connection: getQueueConnection(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return _clusterQueue;
}

export async function closeAllQueues() {
  await Promise.allSettled([
    _fetchQueue?.close(),
    _enrichQueue?.close(),
    _embedQueue?.close(),
    _clusterQueue?.close(),
  ]);
}
