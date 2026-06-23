/**
 * /drafts — list newsletter drafts + "Generate" button.
 *
 * Server component for the list, client component for the generate form
 * (needs onClick + fetch + router.refresh).
 */

import { db } from "@/lib/db/client";
import { newsletterIssues } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { GenerateDraftButton } from "./generate-button";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
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
    })
    .from(newsletterIssues)
    .orderBy(desc(newsletterIssues.createdAt))
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Newsletter Drafts</h1>
          <p className="text-sm text-muted">
            Bilingual weekly drafts generated from the top scored topics.
          </p>
        </div>
        <GenerateDraftButton />
      </div>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-border bg-surface px-4 py-8 text-sm text-muted">
          No drafts yet. Click <em>Generate draft</em> to produce one from the
          last 7 days of topics.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((d) => {
            const start = d.periodStart ? fmt(d.periodStart) : "—";
            const end = d.periodEnd ? fmt(d.periodEnd) : "—";
            const created = d.createdAt ? fmtDateTime(d.createdAt) : "—";
            return (
              <li
                key={d.id}
                className="rounded border border-border bg-surface px-4 py-3 hover:border-accent"
              >
                <Link
                  href={`/drafts/${d.id}` as never}
                  className="block space-y-1"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="text-base font-medium">
                      {d.titleEn ?? "(untitled)"}
                    </h2>
                    <span
                      className={
                        d.status === "published"
                          ? "rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400"
                          : "rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400"
                      }
                    >
                      {d.status}
                    </span>
                  </div>
                  {d.titleZh ? (
                    <p className="text-sm text-muted">{d.titleZh}</p>
                  ) : null}
                  <p className="text-xs text-muted">
                    {start} → {end} · created {created}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function fmt(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}
function fmtDateTime(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 16).replace("T", " ");
}
