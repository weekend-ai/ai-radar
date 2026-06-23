/**
 * POST /api/topics/[id]/notes  body: { notes: string | null }
 * Updates the manual notes scratchpad on a topic.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { TopicActionError, updateTopicNotes } from "@/lib/topics/actions";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { notes?: string | null };
  try {
    await updateTopicNotes(db, id, body.notes ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TopicActionError) {
      const code = e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status: code });
    }
    console.error(e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
