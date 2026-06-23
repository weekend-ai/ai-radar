/**
 * POST /api/topics/[id]/split
 * body: { articleIds: string[], newTitleEn?: string }
 *
 * Spins articleIds out of the source topic into a new topic.
 * Returns { newTopicId, sourceArticleCount, newArticleCount }.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTopic, TopicActionError } from "@/lib/topics/actions";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    articleIds?: string[];
    newTitleEn?: string;
  };
  if (!Array.isArray(body.articleIds) || body.articleIds.length === 0) {
    return NextResponse.json(
      { error: "articleIds[] (non-empty) required" },
      { status: 400 }
    );
  }
  try {
    const result = await splitTopic(db, id, body.articleIds, body.newTitleEn);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof TopicActionError) {
      const code = e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status: code });
    }
    console.error(e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
