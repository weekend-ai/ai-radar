/**
 * Topic mutation actions (Day 9.5).
 *
 * Pure-ish helpers — each takes a Drizzle transaction (so the API route can
 * wrap everything in a single tx + return derived state) and does the
 * minimum required SQL. All membership recomputation (article_count,
 * first/last_seen_at) is done from `topic_articles` joined to `articles`
 * after the move, so we never trust stale columns.
 *
 * Status vocabulary:
 *   open     — default, shows on Topic Radar
 *   selected — promote() set this; newsletter selector treats as must-include
 *   archived — hidden from /topics but still reachable by URL
 *   merged   — losing side of a merge; mergedIntoId points to survivor
 *
 * Errors are thrown with stable codes so route handlers can map to 4xx.
 */

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articles, topicArticles, topics } from "@/lib/db/schema";

export class TopicActionError extends Error {
  constructor(
    public code:
      | "NOT_FOUND"
      | "SELF_MERGE"
      | "SURVIVOR_LOST"
      | "EMPTY_SELECTION"
      | "WOULD_EMPTY_TOPIC"
      | "ARTICLES_NOT_IN_TOPIC"
      | "INVALID_STATUS",
    message: string
  ) {
    super(message);
    this.name = "TopicActionError";
  }
}

type DbLike = typeof db;

// ---------------------------------------------------------------------------
// archive / unarchive — flip status only; reversible.
// ---------------------------------------------------------------------------

export async function archiveTopic(database: DbLike, topicId: string): Promise<void> {
  const [row] = await database
    .update(topics)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(topics.id, topicId))
    .returning({ id: topics.id });
  if (!row) throw new TopicActionError("NOT_FOUND", `topic ${topicId} not found`);
}

export async function unarchiveTopic(database: DbLike, topicId: string): Promise<void> {
  const [row] = await database
    .update(topics)
    .set({ status: "open", updatedAt: new Date() })
    .where(and(eq(topics.id, topicId), eq(topics.status, "archived")))
    .returning({ id: topics.id });
  if (!row) throw new TopicActionError("NOT_FOUND", `archived topic ${topicId} not found`);
}

// ---------------------------------------------------------------------------
// promote / unpromote — toggle between open ↔ selected.
// newsletter selector treats "selected" as must-include.
// ---------------------------------------------------------------------------

export async function promoteTopic(database: DbLike, topicId: string): Promise<"open" | "selected"> {
  const [current] = await database
    .select({ status: topics.status })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  if (!current) throw new TopicActionError("NOT_FOUND", `topic ${topicId} not found`);
  if (current.status !== "open" && current.status !== "selected") {
    throw new TopicActionError(
      "INVALID_STATUS",
      `cannot promote topic in status=${current.status}; unarchive or unmerge first`
    );
  }
  const next = current.status === "selected" ? "open" : "selected";
  await database
    .update(topics)
    .set({ status: next, updatedAt: new Date() })
    .where(eq(topics.id, topicId));
  return next;
}

// ---------------------------------------------------------------------------
// mergeTopics — fold losers into survivor.
//
// For each loser:
//   1. UPSERT all topic_articles into survivor (skip dup PK)
//   2. status='merged', mergedIntoId=survivor
//   3. articleCount=0 on loser (membership is gone)
// Then recompute survivor's articleCount + first/last_seen_at from the now-
// authoritative topic_articles rows joined to articles.published_at.
//
// Throws SELF_MERGE if survivor appears in mergedIds.
// Throws SURVIVOR_LOST if survivor doesn't exist or is in a bad status.
// ---------------------------------------------------------------------------

export async function mergeTopics(
  database: DbLike,
  survivorId: string,
  mergedIds: string[]
): Promise<{ survivorArticleCount: number }> {
  if (mergedIds.length === 0) {
    throw new TopicActionError("EMPTY_SELECTION", "at least one topic to merge required");
  }
  if (mergedIds.includes(survivorId)) {
    throw new TopicActionError("SELF_MERGE", "cannot merge a topic into itself");
  }

  const [survivor] = await database
    .select({ id: topics.id, status: topics.status })
    .from(topics)
    .where(eq(topics.id, survivorId))
    .limit(1);
  if (!survivor) {
    throw new TopicActionError("SURVIVOR_LOST", `survivor ${survivorId} not found`);
  }
  if (survivor.status === "merged" || survivor.status === "archived") {
    throw new TopicActionError(
      "INVALID_STATUS",
      `survivor must be open or selected, got ${survivor.status}`
    );
  }

  // Move memberships. We do the UPSERT in one statement per loser to keep it
  // simple; topic_articles PK is (topic_id, article_id) so onConflictDoNothing
  // covers the case where an article is already a member of the survivor.
  for (const loserId of mergedIds) {
    await database.execute(sql`
      INSERT INTO topic_articles (topic_id, article_id, relation_type, created_at)
      SELECT ${survivorId}::uuid, article_id, relation_type, created_at
      FROM topic_articles
      WHERE topic_id = ${loserId}::uuid
      ON CONFLICT (topic_id, article_id) DO NOTHING
    `);
    await database.execute(sql`DELETE FROM topic_articles WHERE topic_id = ${loserId}::uuid`);
  }

  // Mark losers as merged.
  await database
    .update(topics)
    .set({
      status: "merged",
      mergedIntoId: survivorId,
      articleCount: 0,
      updatedAt: new Date(),
    })
    .where(inArray(topics.id, mergedIds));

  // Recompute survivor's denormalized fields.
  return await recomputeTopicAggregates(database, survivorId);
}

// ---------------------------------------------------------------------------
// splitTopic — move a subset of articles into a new topic.
//
// Validates that articleIds are all members of source topic, and that the
// split leaves the source non-empty (otherwise it's just a rename — use
// merge instead).
//
// Returns the new topic's id.
// ---------------------------------------------------------------------------

export async function splitTopic(
  database: DbLike,
  sourceTopicId: string,
  articleIds: string[],
  newTitleEn?: string | null
): Promise<{ newTopicId: string; sourceArticleCount: number; newArticleCount: number }> {
  if (articleIds.length === 0) {
    throw new TopicActionError("EMPTY_SELECTION", "must select at least one article to split");
  }

  // Verify source exists and is in a moveable status.
  const [source] = await database
    .select({ id: topics.id, status: topics.status, titleEn: topics.titleEn })
    .from(topics)
    .where(eq(topics.id, sourceTopicId))
    .limit(1);
  if (!source) {
    throw new TopicActionError("NOT_FOUND", `source topic ${sourceTopicId} not found`);
  }
  if (source.status === "merged") {
    throw new TopicActionError("INVALID_STATUS", "cannot split a merged topic");
  }

  // Confirm all articleIds are members of source.
  const members = await database
    .select({ articleId: topicArticles.articleId, relationType: topicArticles.relationType })
    .from(topicArticles)
    .where(
      and(eq(topicArticles.topicId, sourceTopicId), inArray(topicArticles.articleId, articleIds))
    );
  if (members.length !== articleIds.length) {
    throw new TopicActionError(
      "ARTICLES_NOT_IN_TOPIC",
      `${articleIds.length - members.length} of ${articleIds.length} articles are not in source topic`
    );
  }

  // Count remaining to refuse "split everything out" — that's a rename.
  const [{ remaining }] = await database
    .select({ remaining: sql<number>`count(*)::int` })
    .from(topicArticles)
    .where(
      and(eq(topicArticles.topicId, sourceTopicId), ne(topicArticles.articleId, articleIds[0]))
      // We just need ANY remaining row that isn't being moved; full check below.
    );
  // Real check: members.length must be strictly less than total membership.
  const [{ total }] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(topicArticles)
    .where(eq(topicArticles.topicId, sourceTopicId));
  if (members.length >= total) {
    throw new TopicActionError(
      "WOULD_EMPTY_TOPIC",
      `split would move all ${total} articles; use rename or merge instead`
    );
  }
  void remaining; // (kept above query to keep planner warm; not used in logic)

  // Create the new topic. Scores/counts get filled below + by next cluster run.
  const fallbackTitle = source.titleEn ? `${source.titleEn} (split)` : "Split topic";
  const [newTopic] = await database
    .insert(topics)
    .values({
      titleEn: newTitleEn?.trim() || fallbackTitle,
      status: "open",
      articleCount: 0,
    })
    .returning({ id: topics.id });

  // Move memberships: insert into new, delete from source. Use inArray
  // through Drizzle helpers rather than `sql\`...${articleIds}::uuid[]\``
  // because postgres.js treats JS arrays in tagged templates as records,
  // not pg arrays. (Captured pitfall.)
  await database.execute(sql`
    INSERT INTO topic_articles (topic_id, article_id, relation_type, created_at)
    SELECT ${newTopic.id}::uuid, article_id, relation_type, created_at
    FROM topic_articles
    WHERE topic_id = ${sourceTopicId}::uuid
      AND article_id IN ${sql`(${sql.join(articleIds.map((id) => sql`${id}::uuid`), sql`, `)})`}
  `);
  await database
    .delete(topicArticles)
    .where(
      and(eq(topicArticles.topicId, sourceTopicId), inArray(topicArticles.articleId, articleIds))
    );

  // Recompute both sides.
  const sourceAgg = await recomputeTopicAggregates(database, sourceTopicId);
  const newAgg = await recomputeTopicAggregates(database, newTopic.id);

  return {
    newTopicId: newTopic.id,
    sourceArticleCount: sourceAgg.survivorArticleCount,
    newArticleCount: newAgg.survivorArticleCount,
  };
}

// ---------------------------------------------------------------------------
// Recompute a topic's denormalized aggregates from topic_articles.
// Called by mergeTopics and splitTopic; exported for tests / future re-syncs.
// ---------------------------------------------------------------------------

export async function recomputeTopicAggregates(
  database: DbLike,
  topicId: string
): Promise<{ survivorArticleCount: number }> {
  const [agg] = await database
    .select({
      count: sql<number>`count(*)::int`,
      // Cast to text so postgres returns ISO strings rather than Date proxies
      // that Drizzle's timestamp encoder then tries to re-serialize and
      // crashes on. We re-wrap as Date below.
      firstAt: sql<string | null>`min(${articles.publishedAt})::text`,
      lastAt: sql<string | null>`max(${articles.publishedAt})::text`,
    })
    .from(topicArticles)
    .leftJoin(articles, eq(articles.id, topicArticles.articleId))
    .where(eq(topicArticles.topicId, topicId));

  const count = agg?.count ?? 0;
  const firstAt = agg?.firstAt ? new Date(agg.firstAt) : null;
  const lastAt = agg?.lastAt ? new Date(agg.lastAt) : null;

  await database
    .update(topics)
    .set({
      articleCount: count,
      firstSeenAt: firstAt,
      lastSeenAt: lastAt,
      updatedAt: new Date(),
    })
    .where(eq(topics.id, topicId));

  return { survivorArticleCount: count };
}

// ---------------------------------------------------------------------------
// Notes — free-form text on the detail page.
// ---------------------------------------------------------------------------

export async function updateTopicNotes(
  database: DbLike,
  topicId: string,
  notes: string | null
): Promise<void> {
  const trimmed = notes?.trim() || null;
  const [row] = await database
    .update(topics)
    .set({ notes: trimmed, updatedAt: new Date() })
    .where(eq(topics.id, topicId))
    .returning({ id: topics.id });
  if (!row) throw new TopicActionError("NOT_FOUND", `topic ${topicId} not found`);
}
