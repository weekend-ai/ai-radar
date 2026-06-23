/**
 * POST /api/topics/[id]/promote — toggle status between 'open' and 'selected'.
 * Returns the new status.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { promoteTopic, TopicActionError } from "@/lib/topics/actions";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const status = await promoteTopic(db, id);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    if (e instanceof TopicActionError) {
      const code = e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status: code });
    }
    console.error(e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
