/**
 * Newsletter draft orchestrator.
 *
 *   generateNewsletterDraft({ windowDays })
 *     1. Query topics within the window (status=open, sorted by score)
 *     2. Fold rows → candidates → bucket into 4 sections
 *     3. Call LLM for section blurbs + title + subject
 *     4. Assemble bilingual markdown deterministically
 *     5. Insert newsletter_issues + newsletter_issue_items rows
 *     6. Return the new issue id
 *
 * Lives outside the request lifecycle (route handler awaits it) — a single
 * call takes ~5-15s on gpt-4o-mini, comfortably inside the default Next
 * server-action timeout.
 */

import { db } from "@/lib/db/client";
import {
  topics,
  topicArticles,
  articles,
  articleInsights,
  sources,
  newsletterIssues,
  newsletterIssueItems,
} from "@/lib/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import {
  bucketTopics,
  foldJoinedRows,
  SECTION_LABELS,
  SECTION_LIMITS,
  SECTION_ORDER,
  type JoinedTopicRow,
  type NewsletterTopicCandidate,
  type Section,
} from "./select";
import {
  callNewsletterLLM,
  PROMPT_VERSION,
  type NewsletterLLMOutput,
} from "./prompt";

export interface GenerateOptions {
  /** How many days back to consider (default 7). */
  windowDays?: number;
  /** Hard cap on candidate topics fetched before bucketing (default 40). */
  candidateLimit?: number;
  /** Override LLM model (defaults to OPENAI_ENRICH_MODEL or gpt-4o-mini). */
  model?: string;
}

export interface GenerateResult {
  issueId: string;
  titleEn: string;
  titleZh: string;
  bodyMarkdown: string;
  candidateCount: number;
  usedTopicCount: number;
  llmMeta: { model: string; promptVersion: string; latencyMs: number };
}

export async function generateNewsletterDraft(
  opts: GenerateOptions = {}
): Promise<GenerateResult> {
  const windowDays = opts.windowDays ?? 7;
  const candidateLimit = opts.candidateLimit ?? 40;

  const now = new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const rows = await fetchCandidateRows(since, candidateLimit);
  const candidates = foldJoinedRows(rows);
  if (candidates.length === 0) {
    throw new Error(
      `No topics found in the last ${windowDays} days — run the cluster worker first.`
    );
  }

  const buckets = bucketTopics(candidates);
  const usedTopicIds = collectUsedTopicIds(buckets);

  const { result: llmOut, meta: llmMeta } = await callNewsletterLLM(
    buckets,
    windowDays,
    { model: opts.model }
  );

  const bodyMarkdown = assembleMarkdown(llmOut, buckets, { windowDays, since, until: now });

  // Persist in a single transaction so we never end up with an issue row
  // without its items (or vice versa).
  const issueId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(newsletterIssues)
      .values({
        titleEn: llmOut.title_en,
        titleZh: llmOut.title_zh,
        subjectEn: llmOut.subject_en,
        subjectZh: llmOut.subject_zh,
        status: "draft",
        language: "bilingual",
        periodStart: since,
        periodEnd: now,
        bodyMarkdown,
      })
      .returning({ id: newsletterIssues.id });

    const items = buildItemRows(inserted.id, buckets);
    if (items.length > 0) {
      await tx.insert(newsletterIssueItems).values(items);
    }
    return inserted.id;
  });

  return {
    issueId,
    titleEn: llmOut.title_en,
    titleZh: llmOut.title_zh,
    bodyMarkdown,
    candidateCount: candidates.length,
    usedTopicCount: usedTopicIds.size,
    llmMeta: { model: llmMeta.model, promptVersion: llmMeta.promptVersion, latencyMs: llmMeta.latencyMs },
  };
}

/**
 * Pull open topics in the window with all their member articles + insights
 * in one flat JOIN. We over-fetch by candidateLimit then fold into per-topic
 * candidates client-side — keeps the SQL simple.
 */
async function fetchCandidateRows(
  since: Date,
  candidateLimit: number
): Promise<JoinedTopicRow[]> {
  // Pull just the topics first so we can apply the candidate limit, then
  // fetch members for exactly those topic ids. Doing it in one query with
  // a LIMIT would limit ROWS not TOPICS and truncate a big cluster.
  const topicRows = await db
    .select({
      id: topics.id,
      titleEn: topics.titleEn,
      summaryEn: topics.summaryEn,
      finalScore: topics.finalScore,
      articleCount: topics.articleCount,
      firstSeenAt: topics.firstSeenAt,
      lastSeenAt: topics.lastSeenAt,
    })
    .from(topics)
    .where(and(eq(topics.status, "open"), gte(topics.lastSeenAt, since)))
    .orderBy(desc(topics.finalScore), desc(topics.articleCount))
    .limit(candidateLimit);

  if (topicRows.length === 0) return [];

  // Use a literal IN list — postgres.js param binding of ANY($1) for uuid[]
  // is unreliable (captured pitfall). Build it with sql.join.
  const topicIds = topicRows.map((t) => t.id);
  const memberRows = await db
    .select({
      topicId: topicArticles.topicId,
      articleId: articles.id,
      title: articles.title,
      url: articles.url,
      publishedAt: articles.publishedAt,
      sourceSlug: sources.id,
      sourceName: sources.name,
      importanceScore: articleInsights.importanceScore,
      summaryEn: articleInsights.summaryEn,
      whyItMattersEn: articleInsights.whyItMattersEn,
      newsletterAngleEn: articleInsights.newsletterAngleEn,
      predictedTags: articleInsights.predictedTags,
      eventType: articleInsights.eventType,
    })
    .from(topicArticles)
    .innerJoin(articles, eq(topicArticles.articleId, articles.id))
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .leftJoin(articleInsights, eq(articleInsights.articleId, articles.id))
    .where(sql`${topicArticles.topicId} IN (${sql.join(topicIds.map((id) => sql`${id}::uuid`), sql`, `)})`);

  const byTopicMeta = new Map(topicRows.map((t) => [t.id, t]));

  return memberRows.map((m): JoinedTopicRow => {
    const t = byTopicMeta.get(m.topicId)!;
    return {
      topic: {
        id: t.id,
        titleEn: t.titleEn,
        summaryEn: t.summaryEn,
        finalScore: t.finalScore,
        articleCount: t.articleCount,
        firstSeenAt: t.firstSeenAt ? new Date(t.firstSeenAt) : null,
        lastSeenAt: t.lastSeenAt ? new Date(t.lastSeenAt) : null,
      },
      article: {
        id: m.articleId,
        title: m.title,
        url: m.url,
        publishedAt: m.publishedAt ? new Date(m.publishedAt) : null,
      },
      source: { id: m.sourceSlug, name: m.sourceName },
      insight: m.importanceScore != null || m.summaryEn != null
        ? {
            importanceScore: m.importanceScore,
            summaryEn: m.summaryEn,
            whyItMattersEn: m.whyItMattersEn,
            newsletterAngleEn: m.newsletterAngleEn,
            predictedTags: m.predictedTags ?? [],
            eventType: m.eventType,
          }
        : null,
    };
  });
}

function collectUsedTopicIds(
  buckets: Record<Section, NewsletterTopicCandidate[]>
): Set<string> {
  const ids = new Set<string>();
  for (const s of SECTION_ORDER) for (const t of buckets[s]) ids.add(t.topicId);
  return ids;
}

/**
 * Build newsletter_issue_items rows: one per (topic, primary_article)
 * + one per (topic, supporting_article) so we can render full attribution
 * later. order_index gives stable rendering inside each section.
 */
function buildItemRows(
  issueId: string,
  buckets: Record<Section, NewsletterTopicCandidate[]>
): Array<typeof newsletterIssueItems.$inferInsert> {
  const rows: Array<typeof newsletterIssueItems.$inferInsert> = [];
  for (const section of SECTION_ORDER) {
    buckets[section].forEach((topic, topicIdx) => {
      // primary article
      rows.push({
        issueId,
        topicId: topic.topicId,
        articleId: topic.primaryArticle.articleId,
        section,
        orderIndex: topicIdx * 10,
        editorNote: "primary",
      });
      // supporting (cap at 4 per topic — past that, link list is noise)
      topic.supportingArticles.slice(0, 4).forEach((art, supIdx) => {
        rows.push({
          issueId,
          topicId: topic.topicId,
          articleId: art.articleId,
          section,
          orderIndex: topicIdx * 10 + supIdx + 1,
          editorNote: "supporting",
        });
      });
    });
  }
  return rows;
}

interface AssembleContext {
  windowDays: number;
  since: Date;
  until: Date;
}

/**
 * Render the LLM blurbs + topic data into a single bilingual markdown doc.
 * Layout: header → for each section: header / blurb_en / blurb_zh / topic
 * blocks (or one-liner list for quick_hits).
 */
export function assembleMarkdown(
  llm: NewsletterLLMOutput,
  buckets: Record<Section, NewsletterTopicCandidate[]>,
  ctx: AssembleContext
): string {
  const lines: string[] = [];
  const dateRange = `${fmtDate(ctx.since)} → ${fmtDate(ctx.until)}`;

  lines.push(`# ${llm.title_en}`);
  lines.push(`### ${llm.title_zh}`);
  lines.push("");
  lines.push(`_${dateRange} · ${ctx.windowDays}d window_`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const section of SECTION_ORDER) {
    const topics = buckets[section];
    if (topics.length === 0) continue;

    const labels = SECTION_LABELS[section];
    lines.push(`## ${labels.en} · ${labels.zh}`);
    lines.push("");

    if (section === "quick_hits") {
      lines.push(llm.sections.quick_hits.blurb_en);
      lines.push("");
      lines.push(`> ${llm.sections.quick_hits.blurb_zh}`);
      lines.push("");
      // Items in the order the LLM gave them; fall back to bucket order
      // for any items it forgot (defensive).
      const seen = new Set<string>();
      for (const item of llm.sections.quick_hits.items) {
        const topic = topics.find((t) => t.topicId === item.topic_id);
        if (!topic) continue;
        seen.add(topic.topicId);
        lines.push(`- **${escapeMd(item.one_liner_en)}** [↗](${topic.primaryArticle.url})`);
        lines.push(`  - ${escapeMd(item.one_liner_zh)}`);
      }
      for (const topic of topics) {
        if (seen.has(topic.topicId)) continue;
        // LLM omitted this one — render with a generic fallback so we don't lose data.
        lines.push(
          `- **${escapeMd(topic.topicTitleEn ?? topic.primaryArticle.title)}** [↗](${topic.primaryArticle.url})`
        );
      }
      lines.push("");
      continue;
    }

    // Narrative section
    const blurb = llm.sections[section];
    lines.push(blurb.blurb_en);
    lines.push("");
    lines.push(`> ${blurb.blurb_zh}`);
    lines.push("");

    for (const topic of topics) {
      const title = topic.topicTitleEn ?? topic.primaryArticle.title;
      lines.push(`### ${escapeMd(title)}`);
      const meta = [
        `score ${topic.finalScore}`,
        `${topic.articleCount} ${topic.articleCount === 1 ? "article" : "articles"}`,
        topic.eventType ?? null,
      ].filter(Boolean);
      lines.push(`_${meta.join(" · ")}_`);
      lines.push("");

      if (topic.primaryArticle.summaryEn) {
        lines.push(escapeMd(topic.primaryArticle.summaryEn));
        lines.push("");
      }
      if (topic.primaryArticle.whyItMattersEn) {
        lines.push(`**Why it matters:** ${escapeMd(topic.primaryArticle.whyItMattersEn)}`);
        lines.push("");
      }

      // Link list — primary first, supporting after
      lines.push(
        `- [${escapeMd(topic.primaryArticle.sourceName)} — ${escapeMd(topic.primaryArticle.title)}](${topic.primaryArticle.url})`
      );
      for (const sup of topic.supportingArticles.slice(0, 4)) {
        lines.push(
          `- [${escapeMd(sup.sourceName)} — ${escapeMd(sup.title)}](${sup.url})`
        );
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(`_Generated by AI Radar · prompt ${PROMPT_VERSION}_`);
  lines.push("");

  return lines.join("\n");
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Minimal markdown escape — we only need to neutralise `[` `]` `|` and the
 * leading `#`/`-` that could break our layout. Full escape would mangle the
 * LLM's intentional emphasis.
 */
function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/(\r?\n)+/g, " ").trim();
}
