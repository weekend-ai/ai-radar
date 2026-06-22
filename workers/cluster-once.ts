/**
 * CLI: pnpm worker:cluster [--threshold N] [--top-k N] [--min-size N] [--window-days N]
 *
 * Wipes existing OPEN topics and re-clusters from current article embeddings.
 */

import "dotenv/config";
import { runClustering, DEFAULT_SIMILARITY_THRESHOLD, DEFAULT_TOP_K, DEFAULT_MIN_TOPIC_SIZE, DEFAULT_WINDOW_DAYS } from "@/lib/cluster/topics";

function flag(name: string, def?: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  if (i === -1) return def;
  return process.argv[i + 1];
}

async function main() {
  const threshold = parseFloat(flag("threshold", String(DEFAULT_SIMILARITY_THRESHOLD))!);
  const topK = parseInt(flag("top-k", String(DEFAULT_TOP_K))!, 10);
  const minSize = parseInt(flag("min-size", String(DEFAULT_MIN_TOPIC_SIZE))!, 10);
  const windowDays = parseInt(flag("window-days", String(DEFAULT_WINDOW_DAYS))!, 10);

  console.log(
    `=== Clustering articles into topics ===\n` +
      `  threshold=${threshold} topK=${topK} minSize=${minSize} windowDays=${windowDays}`
  );
  const s = await runClustering({ threshold, topK, minTopicSize: minSize, windowDays });
  console.log("");
  console.log("=== Summary ===");
  console.log(`  candidate articles: ${s.candidateArticles}`);
  console.log(`  edges found:        ${s.edgesFound}`);
  console.log(`  topics created:     ${s.topicsCreated}`);
  console.log(`  article assignments: ${s.articleAssignments}`);
  console.log(`  largest topic:      ${s.largestTopic} articles`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
