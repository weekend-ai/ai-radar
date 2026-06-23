/**
 * POST /api/topics/[id]/archive  — flip status to 'archived'
 * DELETE /api/topics/[id]/archive — unarchive (back to 'open')
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { archiveTopic, TopicActionError, unarchiveTopic } from "@/lib/topics/actions";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await archiveTopic(db, id);
    return NextResponse.json({ ok: true, status: "archived" });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await unarchiveTopic(db, id);
    return NextResponse.json({ ok: true, status: "open" });
  } catch (e) {
    return errorResponse(e);
  }
}

function errorResponse(e: unknown) {
  if (e instanceof TopicActionError) {
    const code = e.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: e.message, code: e.code }, { status: code });
  }
  console.error(e);
  return NextResponse.json({ error: "internal error" }, { status: 500 });
}
