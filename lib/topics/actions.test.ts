/**
 * Integration tests for topic mutation actions.
 *
 * Talks to the live local Postgres (same one `pnpm dev` uses). Each test
 * creates throwaway topics + topic_articles and cleans up afterwards. We
 * pick the smallest possible fixture: 2 source articles already in the
 * DB so we don't need to seed full pipeline.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articles, topicArticles, topics } from "@/lib/db/schema";
import {
  archiveTopic,
  mergeTopics,
  promoteTopic,
  recomputeTopicAggregates,
  splitTopic,
  TopicActionError,
  unarchiveTopic,
  updateTopicNotes,
} from "./actions";

// Skip the whole file when DATABASE_URL is missing (CI without DB). On a
// developer box with docker compose up, all tests run.
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

const TEST_TAG = "test-topic-actions-";

// Track ids we create so the cleanup hook can wipe them.
const createdTopicIds: string[] = [];

async function fetchTwoArticleIds(): Promise<[string, string, string]> {
  const rows = await db
    .select({ id: articles.id })
    .from(articles)
    .limit(3);
  if (rows.length < 3) throw new Error("need >=3 articles in DB for these tests");
  return [rows[0].id, rows[1].id, rows[2].id];
}

async function makeTopic(label: string): Promise<string> {
  const [{ id }] = await db
    .insert(topics)
    .values({ titleEn: TEST_TAG + label, status: "open", articleCount: 0 })
    .returning({ id: topics.id });
  createdTopicIds.push(id);
  return id;
}

async function attach(topicId: string, articleId: string, relType = "supporting") {
  await db
    .insert(topicArticles)
    .values({ topicId, articleId, relationType: relType });
}

d("topic actions (integration, live DB)", () => {
  let A: string;
  let B: string;
  let C: string;

  beforeAll(async () => {
    if (!HAS_DB) return;
    [A, B, C] = await fetchTwoArticleIds();
  });

  afterAll(async () => {
    if (!HAS_DB) return;
    // Cleanup: kill anything tracked by id AND anything titled with our tag.
    // The latter catches new topics created by splitTopic (which we may not
    // have had a chance to push when a later assertion threw).
    if (createdTopicIds.length > 0) {
      await db.delete(topics).where(inArray(topics.id, createdTopicIds));
    }
    await db.execute(
      sql`DELETE FROM topics WHERE title_en LIKE ${TEST_TAG + "%"} OR title_en = 'Spinoff'`
    );
  });

  it("archive flips status and unarchive restores it", async () => {
    const t = await makeTopic("archive-roundtrip");
    await archiveTopic(db, t);
    const [after1] = await db.select({ status: topics.status }).from(topics).where(eq(topics.id, t));
    expect(after1.status).toBe("archived");

    await unarchiveTopic(db, t);
    const [after2] = await db.select({ status: topics.status }).from(topics).where(eq(topics.id, t));
    expect(after2.status).toBe("open");
  });

  it("archive throws NOT_FOUND for missing id", async () => {
    await expect(
      archiveTopic(db, "00000000-0000-0000-0000-000000000000")
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("promote toggles open ↔ selected idempotently", async () => {
    const t = await makeTopic("promote-toggle");
    const next1 = await promoteTopic(db, t);
    expect(next1).toBe("selected");
    const next2 = await promoteTopic(db, t);
    expect(next2).toBe("open");
  });

  it("promote refuses to act on archived topics", async () => {
    const t = await makeTopic("promote-archived");
    await archiveTopic(db, t);
    await expect(promoteTopic(db, t)).rejects.toMatchObject({ code: "INVALID_STATUS" });
  });

  it("merge rejects self-merge", async () => {
    const t = await makeTopic("self-merge");
    await expect(mergeTopics(db, t, [t])).rejects.toMatchObject({ code: "SELF_MERGE" });
  });

  it("merge rejects empty losers list", async () => {
    const t = await makeTopic("empty-merge");
    await expect(mergeTopics(db, t, [])).rejects.toMatchObject({ code: "EMPTY_SELECTION" });
  });

  it("merge folds two losers into survivor and recomputes count", async () => {
    const survivor = await makeTopic("merge-survivor");
    const loser1 = await makeTopic("merge-loser-1");
    const loser2 = await makeTopic("merge-loser-2");
    await attach(survivor, A);
    await attach(loser1, B); // unique to loser1
    await attach(loser2, A); // duplicate of survivor — must dedup
    await attach(loser2, C); // unique to loser2

    const { survivorArticleCount } = await mergeTopics(db, survivor, [loser1, loser2]);
    expect(survivorArticleCount).toBe(3); // A + B + C, dedup eats the duplicate A

    const losers = await db
      .select({ id: topics.id, status: topics.status, mergedIntoId: topics.mergedIntoId })
      .from(topics)
      .where(inArray(topics.id, [loser1, loser2]));
    for (const l of losers) {
      expect(l.status).toBe("merged");
      expect(l.mergedIntoId).toBe(survivor);
    }

    // Membership rows should all live on survivor now.
    const [{ moved }] = await db
      .select({ moved: sql<number>`count(*)::int` })
      .from(topicArticles)
      .where(inArray(topicArticles.topicId, [loser1, loser2]));
    expect(moved).toBe(0);
  });

  it("split moves selected articles and recomputes both sides", async () => {
    const src = await makeTopic("split-src");
    await attach(src, A);
    await attach(src, B);
    await attach(src, C);

    const result = await splitTopic(db, src, [B, C], "Spinoff");
    createdTopicIds.push(result.newTopicId);

    expect(result.sourceArticleCount).toBe(1);
    expect(result.newArticleCount).toBe(2);

    const [srcAfter] = await db
      .select({ count: topics.articleCount })
      .from(topics)
      .where(eq(topics.id, src));
    expect(srcAfter.count).toBe(1);

    const [newAfter] = await db
      .select({ count: topics.articleCount, titleEn: topics.titleEn, status: topics.status })
      .from(topics)
      .where(eq(topics.id, result.newTopicId));
    expect(newAfter.count).toBe(2);
    expect(newAfter.titleEn).toBe("Spinoff");
    expect(newAfter.status).toBe("open");
  });

  it("split refuses to move every article (would empty source)", async () => {
    const src = await makeTopic("split-empty-out");
    await attach(src, A);
    await attach(src, B);
    await expect(splitTopic(db, src, [A, B])).rejects.toMatchObject({
      code: "WOULD_EMPTY_TOPIC",
    });
  });

  it("split refuses articles that aren't in the source topic", async () => {
    const src = await makeTopic("split-not-member");
    await attach(src, A);
    await attach(src, B);
    // C is not attached to src
    await expect(splitTopic(db, src, [A, C])).rejects.toMatchObject({
      code: "ARTICLES_NOT_IN_TOPIC",
    });
  });

  it("recomputeTopicAggregates fixes a drifted articleCount", async () => {
    const t = await makeTopic("recompute");
    await attach(t, A);
    await attach(t, B);
    // Force-corrupt the denorm count.
    await db.update(topics).set({ articleCount: 999 }).where(eq(topics.id, t));
    const { survivorArticleCount } = await recomputeTopicAggregates(db, t);
    expect(survivorArticleCount).toBe(2);
    const [after] = await db
      .select({ count: topics.articleCount })
      .from(topics)
      .where(eq(topics.id, t));
    expect(after.count).toBe(2);
  });

  it("updateTopicNotes stores trimmed text and clears on empty", async () => {
    const t = await makeTopic("notes");
    await updateTopicNotes(db, t, "  important context  ");
    const [withNotes] = await db.select({ notes: topics.notes }).from(topics).where(eq(topics.id, t));
    expect(withNotes.notes).toBe("important context");

    await updateTopicNotes(db, t, "   ");
    const [cleared] = await db.select({ notes: topics.notes }).from(topics).where(eq(topics.id, t));
    expect(cleared.notes).toBeNull();
  });

  it("TopicActionError carries a stable code", () => {
    try {
      throw new TopicActionError("NOT_FOUND", "x");
    } catch (e) {
      expect(e).toBeInstanceOf(TopicActionError);
      expect((e as TopicActionError).code).toBe("NOT_FOUND");
    }
  });
});
