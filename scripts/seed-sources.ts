import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "@/lib/db/client";
import { sources } from "@/lib/db/schema";
import { seedSources } from "@/lib/seed/sources";
import { sql } from "drizzle-orm";

async function main() {
  console.log(`Seeding ${seedSources.length} sources...`);

  for (const s of seedSources) {
    await db
      .insert(sources)
      .values(s)
      .onConflictDoUpdate({
        target: sources.id,
        set: {
          name: s.name,
          url: s.url,
          type: s.type,
          category: s.category,
          tier: s.tier,
          enabled: s.enabled ?? true,
          priority: s.priority,
          weight: s.weight,
          description: s.description,
          tags: s.tags,
          refreshIntervalMinutes: s.refreshIntervalMinutes,
          updatedAt: sql`NOW()`,
        },
      });
    console.log(`  ✓ ${s.id}`);
  }

  const count = await db.$count(sources);
  console.log(`Done. ${count} sources in database.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
