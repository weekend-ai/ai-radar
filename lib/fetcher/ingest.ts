import { db } from "@/lib/db/client";
import { articles, sources, fetchJobs, type Source } from "@/lib/db/schema";
import { fetchSource } from "./rss";
import { and, eq, or, sql } from "drizzle-orm";

export interface IngestSummary {
  sourceId: string;
  fetched: number;
  inserted: number;
  duplicates: number;
  error?: string;
}

/**
 * Fetch a source, write new articles to DB, update source health, log fetch_job row.
 * Dedup logic: skip if (canonical_url OR hash_url OR hash_title) already exists for same source.
 */
export async function ingestSource(
  source: Source,
  triggeredBy: "scheduler" | "manual" = "manual"
): Promise<IngestSummary> {
  const [job] = await db
    .insert(fetchJobs)
    .values({
      sourceId: source.id,
      status: "running",
      startedAt: new Date(),
      triggeredBy,
    })
    .returning();

  const result = await fetchSource(source);

  if (result.error) {
    await db
      .update(fetchJobs)
      .set({
        status: "error",
        completedAt: new Date(),
        error: result.error,
      })
      .where(eq(fetchJobs.id, job.id));

    await db
      .update(sources)
      .set({
        lastFetchedAt: new Date(),
        lastError: result.error,
        consecutiveFailures: sql`${sources.consecutiveFailures} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id));

    return {
      sourceId: source.id,
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      error: result.error,
    };
  }

  let inserted = 0;
  let duplicates = 0;

  for (const a of result.articles) {
    // Dedup query: same source + (canonical_url match OR title hash match OR url hash match)
    const orConditions = [
      eq(articles.hashUrl, a.hashUrl),
      eq(articles.hashTitle, a.hashTitle),
    ];
    if (a.canonicalUrl) {
      orConditions.push(eq(articles.canonicalUrl, a.canonicalUrl));
    }

    const existing = await db
      .select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.sourceId, source.id), or(...orConditions)))
      .limit(1);

    if (existing.length > 0) {
      duplicates++;
      continue;
    }

    try {
      await db.insert(articles).values(a);
      inserted++;
    } catch (insertErr) {
      // race condition or non-null violation — log and continue
      console.error(`  ! insert failed for ${a.url}: ${insertErr instanceof Error ? insertErr.message : insertErr}`);
    }
  }

  await db
    .update(fetchJobs)
    .set({
      status: "success",
      completedAt: new Date(),
      articleCount: result.fetchedCount,
      newArticleCount: inserted,
    })
    .where(eq(fetchJobs.id, job.id));

  await db
    .update(sources)
    .set({
      lastFetchedAt: new Date(),
      lastSuccessAt: new Date(),
      lastError: null,
      consecutiveFailures: 0,
      articleCount: sql`${sources.articleCount} + ${inserted}`,
      updatedAt: new Date(),
    })
    .where(eq(sources.id, source.id));

  return {
    sourceId: source.id,
    fetched: result.fetchedCount,
    inserted,
    duplicates,
  };
}
