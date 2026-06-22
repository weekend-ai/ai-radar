/**
 * Main scheduler entrypoint.
 *
 * Boots BullMQ queues, workers, and repeatable jobs. Runs forever until
 * SIGINT/SIGTERM, then gracefully drains workers and closes connections.
 *
 * Run as:   pnpm worker:scheduler
 *
 * In dev, this is the single long-lived process. In prod you'd deploy this
 * as a separate process from the Next.js web app (e.g. a Railway worker or
 * a Docker compose service).
 */

import "dotenv/config";
import { startWorkers } from "@/lib/queue/workers";
import { closeAllQueues } from "@/lib/queue/queues";
import { closeRedisConnections } from "@/lib/queue/connection";
import { registerSchedules, triggerImmediatePipeline, SCHEDULES } from "@/lib/queue/scheduler";

async function main() {
  console.log("=== ai-radar scheduler booting ===");
  console.log(`  fetch:   every ${SCHEDULES.FETCH_INTERVAL_MS / 60_000} min (per source)`);
  console.log(`  enrich:  every ${SCHEDULES.ENRICH_INTERVAL_MS / 60_000} min`);
  console.log(`  embed:   every ${SCHEDULES.EMBED_INTERVAL_MS / 60_000} min`);
  console.log(`  cluster: every ${SCHEDULES.CLUSTER_INTERVAL_MS / 60_000} min`);
  console.log("");

  // Boot workers first so they're ready when jobs arrive
  const workers = startWorkers();
  console.log(`✓ ${workers.length} workers started: ${workers.map((w) => w.name).join(", ")}`);

  // Register repeat jobs
  const reg = await registerSchedules();
  console.log(
    `✓ scheduled: ${reg.fetchJobs} fetch jobs (every ${reg.enrichEvery / 60_000}min enrich, ` +
      `${reg.embedEvery / 60_000}min embed, ${reg.clusterEvery / 60_000}min cluster)`
  );

  // Trigger one immediate cycle so we don't wait
  const triggerNow = process.argv.includes("--trigger-now");
  if (triggerNow) {
    await triggerImmediatePipeline();
    console.log("✓ triggered immediate pipeline run");
  }

  console.log("");
  console.log("⏳ scheduler running. Press Ctrl+C to stop.");

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n⏹ received ${signal}, draining workers...`);
    await Promise.allSettled(workers.map((w) => w.close()));
    await closeAllQueues();
    await closeRedisConnections();
    console.log("✓ scheduler stopped");
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("scheduler crashed:", err);
  process.exit(1);
});
