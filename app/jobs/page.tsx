/**
 * Jobs page — read-only view of scheduled pipeline activity.
 *
 * Shows:
 *   - 24h fetch_jobs summary (per-source success/error counts, freshness)
 *   - Last 50 fetch_job rows with status, timing, article counts, errors
 *   - System totals (articles, enriched, embedded, topics)
 *
 * This is the operator's window into "is the scheduler healthy?". No
 * actions exposed — manual run controls can come later.
 */

import { db } from "@/lib/db/client";
import { fetchJobs, sources } from "@/lib/db/schema";
import { desc, eq, sql, gt } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function JobsPage() {
  // System health stats
  const [stats] = await db.execute<{
    total_articles: number;
    total_insights: number;
    embedded: number;
    open_topics: number;
    runs_24h: number;
    errors_24h: number;
    scheduler_runs_24h: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM articles) AS total_articles,
      (SELECT COUNT(*)::int FROM article_insights) AS total_insights,
      (SELECT COUNT(*)::int FROM articles WHERE embedding IS NOT NULL) AS embedded,
      (SELECT COUNT(*)::int FROM topics WHERE status = 'open') AS open_topics,
      (SELECT COUNT(*)::int FROM fetch_jobs WHERE created_at > NOW() - INTERVAL '24 hours') AS runs_24h,
      (SELECT COUNT(*)::int FROM fetch_jobs WHERE status = 'error' AND created_at > NOW() - INTERVAL '24 hours') AS errors_24h,
      (SELECT COUNT(*)::int FROM fetch_jobs WHERE triggered_by = 'scheduler' AND created_at > NOW() - INTERVAL '24 hours') AS scheduler_runs_24h
  `).then((r) => (Array.isArray(r) ? r : (r as { rows: any[] }).rows ?? []));

  // Per-source 24h summary
  const perSource = await db.execute<{
    source_id: string;
    source_name: string;
    runs: number;
    successes: number;
    errors: number;
    total_new: number;
    last_run: Date | null;
    last_status: string | null;
  }>(sql`
    SELECT
      s.id AS source_id,
      s.name AS source_name,
      COUNT(j.id)::int AS runs,
      COUNT(j.id) FILTER (WHERE j.status = 'success')::int AS successes,
      COUNT(j.id) FILTER (WHERE j.status = 'error')::int AS errors,
      COALESCE(SUM(j.new_article_count), 0)::int AS total_new,
      MAX(j.created_at) AS last_run,
      (SELECT status FROM fetch_jobs WHERE source_id = s.id ORDER BY created_at DESC LIMIT 1) AS last_status
    FROM sources s
    LEFT JOIN fetch_jobs j ON j.source_id = s.id AND j.created_at > NOW() - INTERVAL '24 hours'
    WHERE s.enabled = true
    GROUP BY s.id, s.name
    ORDER BY s.id ASC
  `).then((r) => (Array.isArray(r) ? r : (r as { rows: any[] }).rows ?? []));

  // Recent job rows
  const recentJobs = await db
    .select({
      id: fetchJobs.id,
      sourceId: fetchJobs.sourceId,
      status: fetchJobs.status,
      startedAt: fetchJobs.startedAt,
      completedAt: fetchJobs.completedAt,
      articleCount: fetchJobs.articleCount,
      newArticleCount: fetchJobs.newArticleCount,
      error: fetchJobs.error,
      triggeredBy: fetchJobs.triggeredBy,
      createdAt: fetchJobs.createdAt,
    })
    .from(fetchJobs)
    .orderBy(desc(fetchJobs.createdAt))
    .limit(50);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <p className="mt-1 text-sm text-muted">
          Scheduler health, pipeline activity, and last 50 fetch jobs.
        </p>
      </header>

      {/* System stats */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Articles" value={stats?.total_articles ?? 0} />
        <StatCard label="Enriched" value={stats?.total_insights ?? 0} />
        <StatCard label="Embedded" value={stats?.embedded ?? 0} />
        <StatCard label="Open Topics" value={stats?.open_topics ?? 0} />
        <StatCard label="Runs (24h)" value={stats?.runs_24h ?? 0} />
        <StatCard label="Scheduler (24h)" value={stats?.scheduler_runs_24h ?? 0} />
        <StatCard
          label="Errors (24h)"
          value={stats?.errors_24h ?? 0}
          tone={(stats?.errors_24h ?? 0) > 0 ? "warn" : "ok"}
        />
        <StatCard
          label="Success Rate"
          value={
            stats && stats.runs_24h > 0
              ? `${Math.round(((stats.runs_24h - stats.errors_24h) / stats.runs_24h) * 100)}%`
              : "—"
          }
        />
      </section>

      {/* Per-source 24h summary */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Sources (24h)</h2>
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-bg text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-left">source</th>
                <th className="px-3 py-2 text-right">runs</th>
                <th className="px-3 py-2 text-right">errors</th>
                <th className="px-3 py-2 text-right">new articles</th>
                <th className="px-3 py-2 text-left">last status</th>
                <th className="px-3 py-2 text-left">last run</th>
              </tr>
            </thead>
            <tbody>
              {perSource.map((s) => (
                <tr key={s.source_id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{s.source_id}</td>
                  <td className="px-3 py-2 text-right">{s.runs}</td>
                  <td className={`px-3 py-2 text-right ${s.errors > 0 ? "text-red-400" : ""}`}>
                    {s.errors}
                  </td>
                  <td className="px-3 py-2 text-right">{s.total_new}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={s.last_status} />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {s.last_run ? new Date(s.last_run).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent jobs */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Recent jobs (last 50)</h2>
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-xs">
            <thead className="bg-bg uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-left">started</th>
                <th className="px-3 py-2 text-left">source</th>
                <th className="px-3 py-2 text-left">status</th>
                <th className="px-3 py-2 text-left">trigger</th>
                <th className="px-3 py-2 text-right">fetched</th>
                <th className="px-3 py-2 text-right">new</th>
                <th className="px-3 py-2 text-right">duration</th>
                <th className="px-3 py-2 text-left">error</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((j) => {
                const duration =
                  j.startedAt && j.completedAt
                    ? `${Math.round((j.completedAt.getTime() - j.startedAt.getTime()) / 100) / 10}s`
                    : "—";
                return (
                  <tr key={j.id} className="border-t border-border">
                    <td className="px-3 py-2 text-muted">
                      {new Date(j.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono">{j.sourceId}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={j.status} />
                    </td>
                    <td className="px-3 py-2 text-muted">{j.triggeredBy}</td>
                    <td className="px-3 py-2 text-right">{j.articleCount}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {j.newArticleCount > 0 ? `+${j.newArticleCount}` : 0}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">{duration}</td>
                    <td className="max-w-[40ch] truncate px-3 py-2 text-red-400">
                      {j.error ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "warn";
}) {
  const valueClass = tone === "warn" ? "text-red-400" : "";
  return (
    <div className="rounded border border-border bg-surface px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted">—</span>;
  const cls =
    status === "success"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : status === "error"
      ? "bg-red-500/15 text-red-400 border-red-500/30"
      : status === "running"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : "bg-bg text-muted border-border";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${cls}`}>{status}</span>
  );
}
