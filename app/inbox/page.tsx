import { db } from "@/lib/db/client";
import { articles, sources } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source } = await searchParams;

  const baseQuery = db
    .select({
      id: articles.id,
      title: articles.title,
      url: articles.url,
      sourceId: articles.sourceId,
      author: articles.author,
      summary: articles.summaryRaw,
      publishedAt: articles.publishedAt,
      fetchedAt: articles.fetchedAt,
      status: articles.status,
      sourceName: sources.name,
      sourceTier: sources.tier,
    })
    .from(articles)
    .leftJoin(sources, eq(articles.sourceId, sources.id))
    .orderBy(desc(articles.publishedAt))
    .limit(100);

  const rows = await (source ? baseQuery.where(eq(articles.sourceId, source)) : baseQuery);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="mt-1 text-sm text-muted">
          Latest {rows.length} articles{source ? ` from ${source}` : ""}. LLM summaries and scores
          arrive on Day 5.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-border bg-surface px-4 py-8 text-sm text-muted">
          No articles yet. Go to{" "}
          <a href="/sources" className="text-accent hover:underline">
            Sources
          </a>{" "}
          and click <em>Fetch now</em>, or run{" "}
          <code className="rounded bg-black/40 px-1 py-0.5">pnpm worker:fetch</code>.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <li
              key={a.id}
              className="rounded border border-border bg-surface px-4 py-3 hover:border-accent"
            >
              <a href={a.url} target="_blank" rel="noreferrer" className="block">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-base font-medium">{a.title}</h3>
                  <span className="shrink-0 text-xs text-muted">
                    {a.publishedAt?.toISOString().slice(0, 10) ?? ""}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted">
                  T{a.sourceTier} · {a.sourceName ?? a.sourceId}
                  {a.author ? ` · ${a.author}` : ""}
                </div>
                {a.summary && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted">{a.summary}</p>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
