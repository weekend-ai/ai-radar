import { db } from "@/lib/db/client";
import { articles, articleInsights, sources } from "@/lib/db/schema";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Sort = "recent" | "score";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; sort?: Sort; lang?: "en" | "zh" }>;
}) {
  const { source, sort = "recent", lang = "en" } = await searchParams;

  const baseSelect = {
    id: articles.id,
    title: articles.title,
    url: articles.url,
    sourceId: articles.sourceId,
    author: articles.author,
    publishedAt: articles.publishedAt,
    fetchedAt: articles.fetchedAt,
    status: articles.status,
    sourceName: sources.name,
    sourceTier: sources.tier,
    sourceCategory: sources.category,
    // insight fields (may be null)
    insightSummaryEn: articleInsights.summaryEn,
    insightSummaryZh: articleInsights.summaryZh,
    insightOneSentence: articleInsights.oneSentenceSummary,
    insightWhyEn: articleInsights.whyItMattersEn,
    insightWhyZh: articleInsights.whyItMattersZh,
    insightTags: articleInsights.predictedTags,
    insightEventType: articleInsights.eventType,
    insightImportance: articleInsights.importanceScore,
    insightCategory: articleInsights.predictedCategory,
    insightModel: articleInsights.model,
  };

  const orderBy =
    sort === "score"
      ? [desc(articleInsights.importanceScore), desc(articles.publishedAt)]
      : [desc(articles.publishedAt)];

  const where = and(
    source ? eq(articles.sourceId, source) : undefined,
    sort === "score" ? isNotNull(articleInsights.importanceScore) : undefined
  );

  const rows = await db
    .select(baseSelect)
    .from(articles)
    .leftJoin(sources, eq(articles.sourceId, sources.id))
    .leftJoin(articleInsights, eq(articleInsights.articleId, articles.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(100);

  // Quick stats for the header
  const [enrichedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(articleInsights);

  function makeHref(overrides: Partial<{ sort: Sort; lang: "en" | "zh" }>): string {
    const params = new URLSearchParams();
    if (source) params.set("source", source);
    const nextSort = overrides.sort ?? sort;
    const nextLang = overrides.lang ?? lang;
    if (nextSort !== "recent") params.set("sort", nextSort);
    if (nextLang !== "en") params.set("lang", nextLang);
    const qs = params.toString();
    return `/inbox${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Inbox</h1>
          <p className="mt-1 text-sm text-muted">
            Showing {rows.length} articles{source ? ` from ${source}` : ""}. {enrichedCount.count}{" "}
            enriched in DB.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted">sort:</span>
          <TabLink href={makeHref({ sort: "recent" })} active={sort === "recent"}>
            recent
          </TabLink>
          <TabLink href={makeHref({ sort: "score" })} active={sort === "score"}>
            importance
          </TabLink>
          <span className="ml-3 text-muted">lang:</span>
          <TabLink href={makeHref({ lang: "en" })} active={lang === "en"}>
            EN
          </TabLink>
          <TabLink href={makeHref({ lang: "zh" })} active={lang === "zh"}>
            中文
          </TabLink>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-border bg-surface px-4 py-8 text-sm text-muted">
          No articles match this filter.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => {
            const summary = lang === "zh" ? a.insightSummaryZh : a.insightSummaryEn;
            const why = lang === "zh" ? a.insightWhyZh : a.insightWhyEn;
            const score = a.insightImportance;
            return (
              <li
                key={a.id}
                className="group rounded border border-border bg-surface px-4 py-3 hover:border-accent"
              >
                <div className="flex items-start gap-3">
                  {score !== null && score !== undefined ? (
                    <ScoreBadge score={score} />
                  ) : (
                    <div className="mt-1 h-7 w-7 shrink-0 rounded border border-dashed border-border text-center text-xs leading-7 text-muted">
                      –
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <a href={a.url} target="_blank" rel="noreferrer" className="block">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="truncate text-base font-medium group-hover:text-accent">
                          {a.title}
                        </h3>
                        <span className="shrink-0 text-xs text-muted">
                          {a.publishedAt?.toISOString().slice(0, 10) ?? ""}
                        </span>
                      </div>
                    </a>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span>T{a.sourceTier}</span>
                      <span>·</span>
                      <span>{a.sourceName ?? a.sourceId}</span>
                      {a.insightEventType && (
                        <>
                          <span>·</span>
                          <span className="rounded bg-black/30 px-1.5 py-0.5">
                            {a.insightEventType}
                          </span>
                        </>
                      )}
                      {a.insightCategory && a.insightCategory !== a.sourceCategory && (
                        <>
                          <span>·</span>
                          <span>{a.insightCategory}</span>
                        </>
                      )}
                      {a.author && (
                        <>
                          <span>·</span>
                          <span className="truncate">{a.author}</span>
                        </>
                      )}
                    </div>

                    {summary && (
                      <p className="mt-2 line-clamp-2 text-sm text-zinc-300">{summary}</p>
                    )}
                    {why && (
                      <p className="mt-1 text-xs italic text-zinc-500">
                        {lang === "zh" ? "为什么重要：" : "Why it matters: "}
                        {why}
                      </p>
                    )}

                    {a.insightTags && a.insightTags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.insightTags.map((t) => (
                          <span
                            key={t}
                            className="rounded border border-border bg-black/30 px-1.5 py-0.5 text-[10px] text-muted"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  // 1-3 red, 4-6 amber, 7-10 green
  const tone =
    score >= 7
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-700"
      : score >= 4
        ? "bg-amber-500/15 text-amber-300 border-amber-700"
        : "bg-zinc-700/30 text-zinc-400 border-zinc-700";
  return (
    <div
      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border text-xs font-semibold ${tone}`}
      title={`importance: ${score}/10`}
    >
      {score}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as never}
      className={`rounded border px-2 py-1 transition-colors ${
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </Link>
  );
}
