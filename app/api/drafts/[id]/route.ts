/**
 * /api/drafts/[id]
 *   GET    — full draft (incl. bodyMarkdown).
 *   PATCH  — update titles / subject / body / status.
 *   DELETE — delete (items cascade).
 */

import { db } from "@/lib/db/client";
import { newsletterIssues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EDITABLE_FIELDS = [
  "titleEn",
  "titleZh",
  "subjectEn",
  "subjectZh",
  "bodyMarkdown",
  "status",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [row] = await db
    .select()
    .from(newsletterIssues)
    .where(eq(newsletterIssues.id, id));
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const updates: Partial<Record<EditableField, string>> = {};
  for (const k of EDITABLE_FIELDS) {
    if (typeof body[k] === "string") updates[k] = body[k] as string;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no editable fields provided" }, { status: 400 });
  }
  if (updates.status && !["draft", "published"].includes(updates.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const [row] = await db
    .update(newsletterIssues)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(newsletterIssues.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [row] = await db
    .delete(newsletterIssues)
    .where(eq(newsletterIssues.id, id))
    .returning({ id: newsletterIssues.id });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
