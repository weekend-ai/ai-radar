/**
 * CLI: pnpm worker:enrich [--limit N] [--concurrency N] [--max-tier N] [--hydrate]
 *
 * 1. Optionally hydrates sitemap-sourced articles first (fills contentRaw)
 * 2. Runs enrichment in parallel with bounded concurrency
 * 3. Prints summary with token usage + cost estimate
 */

import "dotenv/config";
import { hydratePendingArticles } from "@/lib/enrich/hydrate";
import { enrichPending } from "@/lib/enrich/run";

function parseFlag(name: string, def?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx === -1) return def;
  return process.argv[idx + 1];
}
function parseBool(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const limit = parseInt(parseFlag("limit", "100")!, 10);
  const concurrency = parseInt(parseFlag("concurrency", "5")!, 10);
  const maxTierStr = parseFlag("max-tier");
  const maxTier = maxTierStr ? parseInt(maxTierStr, 10) : undefined;
  const doHydrate = parseBool("hydrate");

  if (doHydrate) {
    console.log("=== Hydrating sitemap-sourced articles (fill contentRaw) ===");
    const h = await hydratePendingArticles({ limit: 500, concurrency: 4 });
    console.log(
      `  attempted=${h.attempted} hydrated=${h.hydrated} skipped=${h.skipped} failed=${h.failed}`
    );
    if (h.failed > 0) {
      const sample = h.results.filter((r) => r.status === "failed").slice(0, 3);
      sample.forEach((s) => console.log(`    ✗ ${s.url} — ${s.error}`));
    }
    console.log("");
  }

  console.log("=== Enriching articles via OpenAI ===");
  console.log(
    `  limit=${limit} concurrency=${concurrency}` +
      (maxTier !== undefined ? ` maxTier=${maxTier}` : "")
  );
  const s = await enrichPending({ limit, concurrency, maxTier });
  console.log("");
  console.log("=== Summary ===");
  console.log(
    `  attempted=${s.attempted} enriched=${s.enriched} failed=${s.failed}`
  );
  console.log(
    `  tokens: input=${s.totalInputTokens} output=${s.totalOutputTokens} ` +
      `cost≈$${s.estCostUsd.toFixed(4)}`
  );
  if (s.errors.length > 0) {
    console.log(`  errors (first 5):`);
    s.errors.slice(0, 5).forEach((e) => console.log(`    ${e.url}: ${e.error}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
