import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db/client";
import {
  articleInsights,
  articles,
  sources,
  topicArticles,
  topics,
} from "@/lib/db/schema";
import { desc, eq, ne } from "drizzle-orm";
import { resolveLang } from "@/lib/i18n.server";
import { ActionsPanel } from "./actions-panel";
import { NotesEditor } from "./notes-editor";

export const dynamic = "force-dynamic";

export default async function TopicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lang = await resolveLang();

  const [topic] = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
  if (!topic) notFound();

  const members = await db
    .select({
      articleId: articles.id,
      title: articles.title,
      url: articles.url,
      author: articles.author,
      publishedAt: articles.publishedAt,
      sourceName: sources.name,
      relationType: topicArticles.relationType,
      summaryEn: articleInsights.summaryEn,
      summaryZh: articleInsights.summaryZh,
      whyEn: articleInsights.whyItMattersEn,
      whyZh: articleInsights.whyItMattersZh,
      importance: articleInsights.importanceScore,
    })
    .from(topicArticles)
    .leftJoin(articles, eq(articles.id, topicArticles.articleId))
    .leftJoin(sources, eq(sources.id, articles.sourceId))
    .leftJoin(articleInsights, eq(articleInsights.articleId, articles.id))
    .where(eq(topicArticles.topicId, id))
    .orderBy(desc(articleInsights.importanceScore), desc(articles.publishedAt));

  // For the merge dialog we need the list of OTHER candidate topics
  // (open or selected, not this one, not merged/archived).
  const otherTopics = await db
    .select({
      id: topics.id,
      titleEn: topics.titleEn,
      articleCount: topics.articleCount,
      finalScore: topics.finalScore,
    })
    .from(topics)
    .where(eq(topics.status, "open"))
    .orderBy(desc(topics.finalScore))
    .limit(50);
  const mergeCandidates = otherTopics.filter((t) => t.id !== id);

  // If this topic was merged, fetch the survivor so we can link to it.
  let mergedSurvivor: { id: string; titleEn: string | null } | null = null;
  if (topic.mergedIntoId) {
    const [s] = await db
      .select({ id: topics.id, titleEn: topics.titleEn })
      .from(topics)
      .where(eq(topics.id, topic.mergedIntoId))
      .limit(1);
    mergedSurvivor = s ?? null;
  }

  const title =
    (lang === "zh" ? topic.titleZh : topic.titleEn) ??
    topic.titleEn ??
    topic.titleZh ??
    "(untitled)";

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 text-xs text-muted">
            <Link href="/topics" className="hover:text-accent">
              ← {lang === "zh" ? "返回话题列表" : "back to topics"}
            </Link>
            <span>·</span>
            <code className="text-[10px]">{topic.id.slice(0, 8)}</code>
          </div>
          <h1 className="mt-1 text-2xl font-semibold leading-tight">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <StatusPill status={topic.status} lang={lang} />
            <span>
              {lang === "zh" ? "文章数" : "articles"}: {topic.articleCount}
            </span>
            {topic.finalScore !== null ? (
              <span>
                {lang === "zh" ? "评分" : "score"}: {topic.finalScore}
              </span>
            ) : null}
            {topic.firstSeenAt ? (
              <span>
                {lang === "zh" ? "首次" : "first"}: {fmt(topic.firstSeenAt)}
              </span>
            ) : null}
            {topic.lastSeenAt ? (
              <span>
                {lang === "zh" ? "最近" : "last"}: {fmt(topic.lastSeenAt)}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {mergedSurvivor ? (
        <div className="rounded border border-amber-700/50 bg-amber-500/10 px-4 py-3 text-sm">
          {lang === "zh" ? "该话题已合并到：" : "This topic was merged into: "}
          <Link
            href={`/topics/${mergedSurvivor.id}` as never}
            className="font-medium text-accent hover:underline"
          >
            {mergedSurvivor.titleEn ?? mergedSurvivor.id}
          </Link>
        </div>
      ) : null}

      <ActionsPanel
        topicId={topic.id}
        status={topic.status}
        articleCount={topic.articleCount}
        lang={lang}
        mergeCandidates={mergeCandidates}
        members={members.map((m) => ({
          articleId: m.articleId ?? "",
          title: m.title ?? "(no title)",
        }))}
      />

      <NotesEditor topicId={topic.id} initialNotes={topic.notes} lang={lang} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          {lang === "zh" ? `成员文章（${members.length}）` : `Member articles (${members.length})`}
        </h2>
        <ul className="space-y-3">
          {members.map((m) => {
            const summary = lang === "zh" ? m.summaryZh : m.summaryEn;
            const why = lang === "zh" ? m.whyZh : m.whyEn;
            return (
              <li
                key={m.articleId ?? Math.random()}
                className="rounded border border-border bg-surface px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <ScoreBadge score={m.importance ?? 0} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-base font-medium leading-snug">
                        {m.url ? (
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-accent hover:underline"
                          >
                            {m.title}
                          </a>
                        ) : (
                          m.title
                        )}
                      </h3>
                      <span className="shrink-0 text-xs text-muted">
                        {m.publishedAt ? fmt(m.publishedAt) : "—"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {m.sourceName ?? m.articleId} · {m.relationType}
                    </p>
                    {summary ? (
                      <p className="mt-2 text-sm text-fg/80">{summary}</p>
                    ) : null}
                    {why ? (
                      <p className="mt-1 text-xs italic text-zinc-500">
                        {lang === "zh" ? "为什么重要：" : "Why it matters: "}
                        {why}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function fmt(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function StatusPill({ status, lang }: { status: string; lang: "en" | "zh" }) {
  const labels: Record<string, { en: string; zh: string; cls: string }> = {
    open: { en: "open", zh: "活跃", cls: "bg-emerald-500/10 text-emerald-300" },
    selected: { en: "selected", zh: "已选中", cls: "bg-blue-500/10 text-blue-300" },
    archived: { en: "archived", zh: "已归档", cls: "bg-zinc-500/10 text-zinc-400" },
    merged: { en: "merged", zh: "已合并", cls: "bg-amber-500/10 text-amber-300" },
    drafted: { en: "drafted", zh: "已撰写", cls: "bg-purple-500/10 text-purple-300" },
  };
  const l = labels[status] ?? { en: status, zh: status, cls: "bg-zinc-500/10 text-zinc-400" };
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] uppercase ${l.cls}`}>
      {lang === "zh" ? l.zh : l.en}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
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
