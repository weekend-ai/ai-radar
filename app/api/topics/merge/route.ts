/**
 * POST /api/topics/merge
 * body: { survivorId: string, mergedIds: string[] }
 *
 * Folds 1+ topics into the survivor. See lib/topics/actions.ts.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { mergeTopics, TopicActionError } from "@/lib/topics/actions";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    survivorId?: string;
    mergedIds?: string[];
  };
  if (!body.survivorId || !Array.isArray(body.mergedIds)) {
    return NextResponse.json(
      { error: "survivorId and mergedIds[] required" },
      { status: 400 }
    );
  }
  try {
    const result = await mergeTopics(db, body.survivorId, body.mergedIds);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof TopicActionError) {
      const code = e.code === "NOT_FOUND" || e.code === "SURVIVOR_LOST" ? 404 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status: code });
    }
    console.error(e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
