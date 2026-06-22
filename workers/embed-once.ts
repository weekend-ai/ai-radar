/**
 * CLI: pnpm worker:embed [--limit N] [--batch N]
 *
 * Embeds articles missing the `embedding` column. Idempotent.
 */

import "dotenv/config";
import { embedPending } from "@/lib/embed/run";

function flag(name: string, def?: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  if (i === -1) return def;
  return process.argv[i + 1];
}

async function main() {
  const limit = parseInt(flag("limit", "3000")!, 10);
  const batch = parseInt(flag("batch", "64")!, 10);

  console.log(`=== Embedding pending articles (limit=${limit} batch=${batch}) ===`);
  const s = await embedPending({ limit, batchSize: batch });
  console.log("");
  console.log("=== Summary ===");
  console.log(
    `  attempted=${s.attempted} embedded=${s.embedded} failed=${s.failed} batches=${s.batches}`
  );
  console.log(
    `  tokens: ${s.totalInputTokens} cost≈$${s.estCostUsd.toFixed(4)}`
  );
  if (s.errors.length > 0) {
    console.log(`  errors (first 5):`);
    s.errors.slice(0, 5).forEach((e) => console.log(`    ${e.articleId}: ${e.error}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
