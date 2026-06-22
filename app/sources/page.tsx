import { db } from "@/lib/db/client";
import { sources } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { FetchButton } from "./fetch-button";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const rows = await db.select().from(sources).orderBy(asc(sources.tier), asc(sources.name));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sources</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length} configured. Tier 1 = official model providers; Tier 4 = arXiv research.
          </p>
        </div>
      </header>

      <div className="overflow-hidden rounded border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-black/40 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-2 py-3 text-left font-medium">Tier</th>
              <th className="px-2 py-3 text-left font-medium">Weight</th>
              <th className="px-2 py-3 text-left font-medium">Interval</th>
              <th className="px-2 py-3 text-left font-medium">Articles</th>
              <th className="px-2 py-3 text-left font-medium">Last fetched</th>
              <th className="px-2 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((s) => {
              const healthy = !s.lastError && s.consecutiveFailures === 0;
              return (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-text"
                      >
                        {s.id}
                      </a>{" "}
                      · {s.category ?? "—"}
                    </div>
                  </td>
                  <td className="px-2 py-3">T{s.tier}</td>
                  <td className="px-2 py-3">{s.weight}</td>
                  <td className="px-2 py-3 text-muted">{s.refreshIntervalMinutes}m</td>
                  <td className="px-2 py-3">{s.articleCount}</td>
                  <td className="px-2 py-3 text-muted">
                    {s.lastFetchedAt ? s.lastFetchedAt.toISOString().slice(0, 16) : "never"}
                  </td>
                  <td className="px-2 py-3">
                    {!s.enabled ? (
                      <span className="text-muted">disabled</span>
                    ) : healthy ? (
                      <span className="text-green-400">healthy</span>
                    ) : (
                      <span className="text-red-400" title={s.lastError ?? ""}>
                        error ({s.consecutiveFailures})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <FetchButton sourceId={s.id} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
