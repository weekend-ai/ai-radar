/**
 * /api/drafts
 *   POST   — generate a new newsletter draft and return its id.
 *   GET    — list drafts (newest first).
 *
 * Generation is synchronous and takes ~5-15s on gpt-4o-mini. The Next route
 * handler default timeout is enough; we expose `maxDuration` explicitly so
 * Vercel-style deployers don't kill it at 10s.
 */

import { db } from "@/lib/db/client";
import { newsletterIssues } from "@/lib/db/schema";
import { generateNewsletterDraft } from "@/lib/newsletter/generate";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const rows = await db
    .select({
      id: newsletterIssues.id,
      titleEn: newsletterIssues.titleEn,
      titleZh: newsletterIssues.titleZh,
      subjectEn: newsletterIssues.subjectEn,
      status: newsletterIssues.status,
      periodStart: newsletterIssues.periodStart,
      periodEnd: newsletterIssues.periodEnd,
      createdAt: newsletterIssues.createdAt,
      updatedAt: newsletterIssues.updatedAt,
    })
    .from(newsletterIssues)
    .orderBy(desc(newsletterIssues.createdAt))
    .limit(50);
  return NextResponse.json({ drafts: rows });
}

export async function POST(req: Request) {
  let body: { windowDays?: number; candidateLimit?: number; model?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // empty body is fine — defaults apply
  }
  try {
    const result = await generateNewsletterDraft({
      windowDays: body.windowDays,
      candidateLimit: body.candidateLimit,
      model: body.model,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // No-topics error is a user-actionable 400, everything else is a 500.
    const status = /No topics found/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
