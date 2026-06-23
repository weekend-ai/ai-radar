/**
 * Topic Radar — clusters of related articles surfaced by embedding similarity.
 *
 * Each topic has:
 *   - primary article (highest-importance member)
 *   - supporting articles (other cluster members)
 *   - article count + composite score
 *
 * Sort by final_score desc (importance + log2(size) bonus) so a 6-source
 * cluster about Opus 4.6 outranks a single 9/10 paper.
 */

import { db } from "@/lib/db/client";
import { topics, topicArticles, articles, articleInsights, sources } from "@/lib/db/schema";
import { desc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { resolveLang } from "@/lib/i18n.server";

export const dynamic = "force-dynamic";

type Sort = "score" | "size" | "recent";

// Topics in these statuses should appear on the Topic Radar list. `selected`
// is included so a promoted topic stays visible at the top. `merged`,
// `archived`, `dismissed`, `drafted` are deliberately filtered out.
const LIST_STATUSES = ["open", "selected"] as const;

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: Sort; lang?: "en" | "zh" }>;
}) {
  const params = await searchParams;
  const sort: Sort = params.sort ?? "score";
  const lang = await resolveLang(params);

  // Order topics
  const topicsOrderBy =
    sort === "size"
      ? [desc(topics.articleCount), desc(topics.finalScore)]
      : sort === "recent"
      ? [desc(topics.lastSeenAt)]
      : [desc(topics.finalScore), desc(topics.articleCount)];

  const topicRows = await db
    .select({
      id: topics.id,
      titleEn: topics.titleEn,
      status: topics.status,
      finalScore: topics.finalScore,
      importanceScore: topics.importanceScore,
      articleCount: topics.articleCount,
      firstSeenAt: topics.firstSeenAt,
      lastSeenAt: topics.lastSeenAt,
      primaryArticleId: topics.primaryArticleId,
    })
    .from(topics)
    .where(inArray(topics.status, LIST_STATUSES as unknown as string[]))
    .orderBy(...topicsOrderBy)
    .limit(60);

  // For each topic, fetch its member articles with insights
  // Single query joining topic_articles → articles → article_insights → sources,
  // filtered to just the topic IDs we're showing.
  const topicIds = topicRows.map((t) => t.id);
  const memberRows =
    topicIds.length > 0
      ? await db
          .select({
            topicId: topicArticles.topicId,
            relationType: topicArticles.relationType,
            articleId: articles.id,
            title: articles.title,
            url: articles.url,
            publishedAt: articles.publishedAt,
            sourceId: articles.sourceId,
            sourceName: sources.name,
            sourceTier: sources.tier,
            sourceCategory: sources.category,
            summaryEn: articleInsights.summaryEn,
            summaryZh: articleInsights.summaryZh,
            oneSentence: articleInsights.oneSentenceSummary,
            whyEn: articleInsights.whyItMattersEn,
            whyZh: articleInsights.whyItMattersZh,
            tags: articleInsights.predictedTags,
            eventType: articleInsights.eventType,
            importance: articleInsights.importanceScore,
          })
          .from(topicArticles)
          .leftJoin(articles, eq(topicArticles.articleId, articles.id))
          .leftJoin(sources, eq(articles.sourceId, sources.id))
          .leftJoin(articleInsights, eq(articleInsights.articleId, articles.id))
          .where(sql`${topicArticles.topicId} IN (${sql.join(topicIds.map((id) => sql`${id}`), sql`, `)})`)
      : [];

  // Group members by topicId
  const membersByTopic = new Map<string, typeof memberRows>();
  for (const m of memberRows) {
    if (!m.topicId) continue;
    if (!membersByTopic.has(m.topicId)) membersByTopic.set(m.topicId, []);
    membersByTopic.get(m.topicId)!.push(m);
  }

  // Stats header
  const [stats] = await db
    .select({
      totalTopics: sql<number>`count(*)::int`,
      totalAssignments: sql<number>`coalesce(sum(${topics.articleCount}), 0)::int`,
      maxSize: sql<number>`coalesce(max(${topics.articleCount}), 0)::int`,
    })
    .from(topics)
    .where(inArray(topics.status, LIST_STATUSES as unknown as string[]));

  function makeHref(overrides: Partial<{ sort: Sort }>): string {
    const params = new URLSearchParams();
    const nextSort = overrides.sort ?? sort;
    if (nextSort !== "score") params.set("sort", nextSort);
    // lang is handled globally by the topbar LangToggle (cookie + URL),
    // so we don't carry it on per-page nav links.
    const qs = params.toString();
    return `/topics${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("topics.title", lang)}</h1>
          <p className="mt-1 text-sm text-muted">
            {lang === "zh"
              ? `${stats.totalTopics} 个活跃话题 · ${stats.totalAssignments} 篇文章 · 最大簇 ${stats.maxSize} 篇`
              : `${stats.totalTopics} active topics · ${stats.totalAssignments} article assignments · largest cluster: ${stats.maxSize} articles`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted">{t("common.sort", lang)}:</span>
          <TabLink href={makeHref({ sort: "score" })} active={sort === "score"}>
            {t("common.score", lang)}
          </TabLink>
          <TabLink href={makeHref({ sort: "size" })} active={sort === "size"}>
            {t("common.size", lang)}
          </TabLink>
          <TabLink href={makeHref({ sort: "recent" })} active={sort === "recent"}>
            {t("common.recent", lang)}
          </TabLink>
        </div>
      </header>

      {topicRows.length === 0 ? (
        <div className="rounded border border-dashed border-border bg-surface px-4 py-8 text-sm text-muted">
          No topics yet. Run <code className="rounded bg-bg px-1.5 py-0.5">pnpm worker:embed</code>{" "}
          then <code className="rounded bg-bg px-1.5 py-0.5">pnpm worker:cluster</code> to populate.
        </div>
      ) : (
        <ul className="space-y-4">
          {topicRows.map((t) => {
            const members = membersByTopic.get(t.id) ?? [];
            // Primary first, then sorted by importance desc
            const primary = members.find((m) => m.articleId === t.primaryArticleId);
            const supporting = members
              .filter((m) => m.articleId !== t.primaryArticleId)
              .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));

            return (
              <li key={t.id} className="rounded border border-border bg-surface p-4">
                {/* Topic header row */}
                <div className="flex items-start gap-3">
                  <ScoreBadge score={t.finalScore ?? 0} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-medium leading-snug">
                      {primary?.url ? (
                        <a
                          href={primary.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-accent hover:underline"
                        >
                          {t.titleEn}
                        </a>
                      ) : (
                        t.titleEn
                      )}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <Link
                        href={`/topics/${t.id}` as never}
                        className="rounded border border-border bg-bg px-1.5 py-0.5 hover:border-accent hover:text-accent"
                      >
                        {lang === "zh" ? "详情" : "detail"} →
                      </Link>
                      {t.status === "selected" ? (
                        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 uppercase tracking-wide text-blue-300">
                          {lang === "zh" ? "已选中" : "selected"}
                        </span>
                      ) : null}
                      <span className="rounded bg-bg px-1.5 py-0.5">
                        {t.articleCount} {lang === "zh" ? "篇" : "articles"}
                      </span>
                      {primary?.eventType && (
                        <span className="rounded border border-border px-1.5 py-0.5 uppercase tracking-wide">
                          {primary.eventType}
                        </span>
                      )}
                      {t.lastSeenAt && (
                        <span>
                          last: {new Date(t.lastSeenAt).toLocaleDateString()}
                        </span>
                      )}
                      {Array.isArray(primary?.tags) &&
                        (primary?.tags as string[]).slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-bg px-1.5 py-0.5 text-[10px]"
                          >
                            #{tag}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>

                {/* Primary article summary */}
                {primary && (
                  <div className="mt-3 ml-12 space-y-2 text-sm">
                    {(lang === "zh" ? primary.summaryZh : primary.summaryEn) && (
                      <p className="text-fg/80">
                        {lang === "zh" ? primary.summaryZh : primary.summaryEn}
                      </p>
                    )}
                    {(lang === "zh" ? primary.whyZh : primary.whyEn) && (
                      <p className="text-xs italic text-muted">
                        💡 {lang === "zh" ? primary.whyZh : primary.whyEn}
                      </p>
                    )}
                  </div>
                )}

                {/* Supporting articles */}
                {supporting.length > 0 && (
                  <div className="mt-3 ml-12 border-l-2 border-border pl-3">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">
                      {supporting.length} related
                    </div>
                    <ul className="space-y-1.5">
                      {supporting.slice(0, 6).map((m) => (
                        <li
                          key={m.articleId ?? ""}
                          className="flex items-start gap-2 text-xs"
                        >
                          <span className="mt-0.5 inline-block min-w-[2.2rem] rounded bg-bg px-1 text-center font-mono text-[10px] text-muted">
                            {m.importance ?? "—"}
                          </span>
                          <div className="min-w-0 flex-1">
                            {m.url ? (
                              <a
                                href={m.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-fg/90 hover:text-accent hover:underline"
                              >
                                {m.title}
                              </a>
                            ) : (
                              <span className="text-fg/90">{m.title}</span>
                            )}
                            <span className="ml-2 text-muted">
                              · {m.sourceName ?? m.sourceId}
                            </span>
                          </div>
                        </li>
                      ))}
                      {supporting.length > 6 && (
                        <li className="text-[10px] text-muted">
                          + {supporting.length - 6} more…
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
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
      className={`rounded px-2 py-1 ${
        active
          ? "bg-accent text-bg"
          : "border border-border text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </Link>
  );
}

function ScoreBadge({ score }: { score: number }) {
  // Same color scale as Inbox for visual continuity
  const bg =
    score >= 9
      ? "bg-red-500/15 text-red-400 border-red-500/30"
      : score >= 7
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : score >= 5
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : "bg-bg text-muted border-border";
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border text-sm font-semibold ${bg}`}
    >
      {score}
    </div>
  );
}
