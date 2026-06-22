import { db } from "@/lib/db/client";
import { sources } from "@/lib/db/schema";
import { ingestSource } from "@/lib/fetcher/ingest";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [s] = await db.select().from(sources).where(eq(sources.id, id));
  if (!s) return NextResponse.json({ error: "source not found" }, { status: 404 });

  const result = await ingestSource(s, "manual");
  return NextResponse.json(result);
}
