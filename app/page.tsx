import { db } from "@/lib/db/client";
import { articles, sources, fetchJobs } from "@/lib/db/schema";
import { sql, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [sourceCount, articleCount, recentArticles, recentJobs] = await Promise.all([
    db.$count(sources),
    db.$count(articles),
    db.select().from(articles).orderBy(desc(articles.fetchedAt)).limit(5),
    db.select().from(fetchJobs).orderBy(desc(fetchJobs.createdAt)).limit(5),
  ]);

  const articles24h = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(articles)
    .where(sql`${articles.fetchedAt} > NOW() - INTERVAL '24 hours'`);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          High-level status of the radar. The MVP day-1-2 minimal loop covers Sources and Inbox; the
          rest comes online as you implement Days 3–10.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Sources" value={sourceCount} />
        <Stat label="Articles (total)" value={articleCount} />
        <Stat label="Articles (24h)" value={articles24h[0]?.c ?? 0} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">
          Recent articles
        </h2>
        {recentArticles.length === 0 ? (
          <Empty hint="Run `pnpm worker:fetch` to pull your first articles." />
        ) : (
          <ul className="divide-y divide-border rounded border border-border bg-surface">
            {recentArticles.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <div className="text-sm">{a.title}</div>
                <div className="mt-1 text-xs text-muted">
                  {a.sourceId} · {a.publishedAt?.toISOString().slice(0, 16) ?? "no date"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">
          Recent fetch jobs
        </h2>
        {recentJobs.length === 0 ? (
          <Empty hint="No fetch jobs yet." />
        ) : (
          <ul className="divide-y divide-border rounded border border-border bg-surface text-sm">
            {recentJobs.map((j) => (
              <li key={j.id} className="px-4 py-3">
                <span
                  className={
                    j.status === "success"
                      ? "text-green-400"
                      : j.status === "error"
                        ? "text-red-400"
                        : "text-muted"
                  }
                >
                  {j.status}
                </span>{" "}
                · {j.sourceId} · fetched={j.articleCount} new={j.newArticleCount}
                {j.error ? <span className="ml-2 text-red-400">— {j.error}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-surface px-4 py-5">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="rounded border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted">
      {hint}
    </div>
  );
}
