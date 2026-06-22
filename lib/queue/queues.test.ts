/**
 * Smoke tests for queue config — these don't talk to Redis, they just verify
 * the module wiring and exports are correct.
 */

import { describe, it, expect } from "vitest";
import {
  QUEUES,
  QUEUE_PREFIX,
  type FetchJobData,
  type EnrichJobData,
  type EmbedJobData,
  type ClusterJobData,
} from "./queues";
import { WORKER_CONCURRENCY } from "./workers";
import { SCHEDULES } from "./scheduler";

describe("queue config", () => {
  it("exposes all 4 queue names", () => {
    expect(QUEUES.FETCH).toBe("fetch");
    expect(QUEUES.ENRICH).toBe("enrich");
    expect(QUEUES.EMBED).toBe("embed");
    expect(QUEUES.CLUSTER).toBe("cluster");
  });

  it("uses a namespaced redis prefix", () => {
    expect(QUEUE_PREFIX).toMatch(/^ai-radar/);
  });

  it("cluster has concurrency 1 (singleton)", () => {
    // Cluster wipes & rewrites the topics table — must not race with itself
    expect(WORKER_CONCURRENCY.cluster).toBe(1);
  });

  it("fetch has concurrency > 1 (parallel I/O)", () => {
    expect(WORKER_CONCURRENCY.fetch).toBeGreaterThan(1);
  });

  it("all schedules are positive ms intervals", () => {
    expect(SCHEDULES.FETCH_INTERVAL_MS).toBeGreaterThan(0);
    expect(SCHEDULES.ENRICH_INTERVAL_MS).toBeGreaterThan(0);
    expect(SCHEDULES.EMBED_INTERVAL_MS).toBeGreaterThan(0);
    expect(SCHEDULES.CLUSTER_INTERVAL_MS).toBeGreaterThan(0);
  });

  it("cluster runs less frequently than enrich (expensive)", () => {
    expect(SCHEDULES.CLUSTER_INTERVAL_MS).toBeGreaterThanOrEqual(SCHEDULES.ENRICH_INTERVAL_MS);
  });

  it("type shapes compile (smoke check)", () => {
    const f: FetchJobData = { sourceId: "test" };
    const e: EnrichJobData = { limit: 10 };
    const em: EmbedJobData = { limit: 100 };
    const c: ClusterJobData = {};
    expect(f.sourceId).toBe("test");
    expect(e.limit).toBe(10);
    expect(em.limit).toBe(100);
    expect(c).toEqual({});
  });
});
