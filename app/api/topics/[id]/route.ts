/**
 * GET /api/topics/[id] — topic detail with members, insights, source info.
 *
 * Used by the server-rendered detail page and by client dialogs (merge,
 * split) that need a fresh snapshot after a mutation.
 *
 * Returns 404 if the topic doesn't exist; merged or archived topics are
 * still returned so the UI can render a "this topic was merged into …"
 * banner.
 */

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  articleInsights,
  articles,
  sources,
  topicArticles,
  topics,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const [topic] = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
  if (!topic) {
    return NextResponse.json({ error: "topic not found" }, { status: 404 });
  }

  const members = await db
    .select({
      articleId: articles.id,
      title: articles.title,
      url: articles.url,
      author: articles.author,
      publishedAt: articles.publishedAt,
      sourceId: articles.sourceId,
      sourceName: sources.name,
      sourceTier: sources.tier,
      relationType: topicArticles.relationType,
      summaryEn: articleInsights.summaryEn,
      summaryZh: articleInsights.summaryZh,
      whyEn: articleInsights.whyItMattersEn,
      whyZh: articleInsights.whyItMattersZh,
      importance: articleInsights.importanceScore,
      tags: articleInsights.predictedTags,
    })
    .from(topicArticles)
    .leftJoin(articles, eq(articles.id, topicArticles.articleId))
    .leftJoin(sources, eq(sources.id, articles.sourceId))
    .leftJoin(articleInsights, eq(articleInsights.articleId, articles.id))
    .where(eq(topicArticles.topicId, id))
    .orderBy(desc(articleInsights.importanceScore), desc(articles.publishedAt));

  return NextResponse.json({ topic, members });
}
