/**
 * /drafts/[id] — single draft viewer + editor.
 *
 * Layout: header (titles, status pill, export buttons) → markdown editor
 * (textarea) + live preview (rendered markdown). Saving + status toggle +
 * export-to-clipboard + mailto handoff all live in the client component
 * `DraftEditor` so this server component just fetches and hands data down.
 */

import { db } from "@/lib/db/client";
import { newsletterIssues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DraftEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function DraftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [row] = await db
    .select()
    .from(newsletterIssues)
    .where(eq(newsletterIssues.id, id));
  if (!row) notFound();

  return (
    <div className="space-y-4">
      <div className="text-sm">
        <Link href={"/drafts" as never} className="text-muted hover:text-fg">
          ← All drafts
        </Link>
      </div>
      <DraftEditor
        id={row.id}
        initialTitleEn={row.titleEn ?? ""}
        initialTitleZh={row.titleZh ?? ""}
        initialSubjectEn={row.subjectEn ?? ""}
        initialSubjectZh={row.subjectZh ?? ""}
        initialBody={row.bodyMarkdown ?? ""}
        initialStatus={(row.status ?? "draft") as "draft" | "published"}
        periodStart={row.periodStart ? new Date(row.periodStart).toISOString() : null}
        periodEnd={row.periodEnd ? new Date(row.periodEnd).toISOString() : null}
      />
    </div>
  );
}
