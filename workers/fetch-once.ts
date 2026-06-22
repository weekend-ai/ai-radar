import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "@/lib/db/client";
import { sources } from "@/lib/db/schema";
import { ingestSource } from "@/lib/fetcher/ingest";
import { eq } from "drizzle-orm";

/**
 * Fetch one or all enabled sources, once. Used for local testing
 * (`pnpm worker:fetch`) and as the body of the eventual scheduler tick.
 *
 * Usage:
 *   pnpm worker:fetch              # all enabled sources
 *   pnpm worker:fetch openai-blog  # one source by id
 */
async function main() {
  const idArg = process.argv[2];

  const rows = idArg
    ? await db.select().from(sources).where(eq(sources.id, idArg))
    : await db.select().from(sources).where(eq(sources.enabled, true));

  if (rows.length === 0) {
    console.log("No sources to fetch.");
    process.exit(0);
  }

  console.log(`Fetching ${rows.length} source(s)...`);
  for (const s of rows) {
    process.stdout.write(`  → ${s.id} ... `);
    const r = await ingestSource(s, "manual");
    if (r.error) console.log(`✗ ${r.error}`);
    else console.log(`fetched=${r.fetched} new=${r.inserted} dup=${r.duplicates}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
