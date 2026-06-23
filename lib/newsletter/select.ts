/**
 * Newsletter section selection.
 *
 * Given a time window and the current topics+articles state, partition topics
 * into the four newsletter sections by event_type + final_score rules.
 *
 * Sections:
 *   - top_stories  — top 3 by final_score, any event_type, dedup vs other buckets
 *   - infra_watch  — event_type ∈ {product_update, model_release, tool}, top 3
 *   - research     — event_type ∈ {research, analysis} OR source slug starts "arxiv-", top 3
 *   - quick_hits   — remaining top 5 by score, one-liner each
 *
 * The same topic is never used twice; top_stories wins over infra_watch wins
 * over research wins over quick_hits.
 */

import type { Article, ArticleInsight, Source, Topic } from "@/lib/db/schema";

export type Section = "top_stories" | "infra_watch" | "research" | "quick_hits";

export const SECTION_ORDER: Section[] = [
  "top_stories",
  "infra_watch",
  "research",
  "quick_hits",
];

export const SECTION_LABELS: Record<Section, { en: string; zh: string }> = {
  top_stories: { en: "Top Stories", zh: "头条要闻" },
  infra_watch: { en: "Infra Watch", zh: "基础设施观察" },
  research: { en: "Research", zh: "研究前沿" },
  quick_hits: { en: "Quick Hits", zh: "快讯" },
};

export const SECTION_LIMITS: Record<Section, number> = {
  top_stories: 3,
  infra_watch: 3,
  research: 3,
  quick_hits: 5,
};

const INFRA_EVENT_TYPES = new Set(["product_update", "model_release", "tool"]);
const RESEARCH_EVENT_TYPES = new Set(["research", "analysis"]);

/**
 * One topic with the data the newsletter prompt needs. Built from a JOIN
 * of topics → topic_articles → articles → article_insights → sources.
 *
 * The "primary" article is the most-important member (by importance_score),
 * which seeds the section blurb. "supporting" are the other members.
 */
export interface NewsletterTopicCandidate {
  topicId: string;
  topicTitleEn: string | null;
  topicSummaryEn: string | null;
  finalScore: number;
  articleCount: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  primaryArticle: NewsletterArticleRef;
  supportingArticles: NewsletterArticleRef[];
  /**
   * Aggregated event_type across members — we pick the most common one,
   * with the primary article's event_type as tiebreaker.
   */
  eventType: string | null;
  /** True iff at least one member came from a source whose slug starts with "arxiv-". */
  hasArxiv: boolean;
}

export interface NewsletterArticleRef {
  articleId: string;
  title: string;
  url: string;
  sourceName: string;
  sourceSlug: string;
  publishedAt: Date | null;
  importanceScore: number | null;
  summaryEn: string | null;
  whyItMattersEn: string | null;
  newsletterAngleEn: string | null;
  tags: string[];
  eventType: string | null;
}

/** Shape of the rows we expect from the topic+articles JOIN. */
export interface JoinedTopicRow {
  topic: Pick<
    Topic,
    "id" | "titleEn" | "summaryEn" | "finalScore" | "articleCount" | "firstSeenAt" | "lastSeenAt"
  >;
  article: Pick<Article, "id" | "title" | "url" | "publishedAt">;
  /** `source.id` is the human-readable slug like "openai-blog" / "arxiv-cs-ai". */
  source: Pick<Source, "id" | "name">;
  insight: Pick<
    ArticleInsight,
    | "importanceScore"
    | "summaryEn"
    | "whyItMattersEn"
    | "newsletterAngleEn"
    | "predictedTags"
    | "eventType"
  > | null;
}

/**
 * Fold a flat JOIN result into per-topic candidates with their member articles.
 * Members sorted by importance desc; primary = first.
 */
export function foldJoinedRows(rows: JoinedTopicRow[]): NewsletterTopicCandidate[] {
  const byTopic = new Map<string, NewsletterTopicCandidate>();

  for (const row of rows) {
    const ref: NewsletterArticleRef = {
      articleId: row.article.id,
      title: row.article.title,
      url: row.article.url,
      sourceName: row.source.name,
      sourceSlug: row.source.id,
      publishedAt: row.article.publishedAt ?? null,
      importanceScore: row.insight?.importanceScore ?? null,
      summaryEn: row.insight?.summaryEn ?? null,
      whyItMattersEn: row.insight?.whyItMattersEn ?? null,
      newsletterAngleEn: row.insight?.newsletterAngleEn ?? null,
      tags: row.insight?.predictedTags ?? [],
      eventType: row.insight?.eventType ?? null,
    };

    const existing = byTopic.get(row.topic.id);
    if (!existing) {
      byTopic.set(row.topic.id, {
        topicId: row.topic.id,
        topicTitleEn: row.topic.titleEn,
        topicSummaryEn: row.topic.summaryEn,
        finalScore: row.topic.finalScore ?? 0,
        articleCount: row.topic.articleCount ?? 0,
        firstSeenAt: row.topic.firstSeenAt ?? null,
        lastSeenAt: row.topic.lastSeenAt ?? null,
        primaryArticle: ref, // placeholder; finalised below
        supportingArticles: [ref],
        eventType: ref.eventType,
        hasArxiv: ref.sourceSlug.startsWith("arxiv-"),
      });
    } else {
      existing.supportingArticles.push(ref);
      if (ref.sourceSlug.startsWith("arxiv-")) existing.hasArxiv = true;
    }
  }

  // Promote highest-importance member to primary, rebuild supporting list,
  // recompute aggregated eventType.
  for (const cand of byTopic.values()) {
    cand.supportingArticles.sort(
      (a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0)
    );
    cand.primaryArticle = cand.supportingArticles[0];
    cand.supportingArticles = cand.supportingArticles.slice(1);
    cand.eventType = pickEventType(cand);
  }

  return [...byTopic.values()];
}

function pickEventType(cand: NewsletterTopicCandidate): string | null {
  const all = [cand.primaryArticle, ...cand.supportingArticles]
    .map((a) => a.eventType)
    .filter((t): t is string => Boolean(t));
  if (all.length === 0) return null;
  // Mode, with primary article's value as tiebreaker.
  const counts = new Map<string, number>();
  for (const t of all) counts.set(t, (counts.get(t) ?? 0) + 1);
  let best = all[0];
  let bestCount = -1;
  for (const [t, c] of counts) {
    if (c > bestCount || (c === bestCount && t === cand.primaryArticle.eventType)) {
      best = t;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Partition candidates into sections. Each topic is assigned to the first
 * section it qualifies for (top_stories > infra_watch > research > quick_hits)
 * and never reused.
 */
export function bucketTopics(
  candidates: NewsletterTopicCandidate[]
): Record<Section, NewsletterTopicCandidate[]> {
  // Sort once, score-desc — this drives every section's pick order.
  const sorted = [...candidates].sort((a, b) => b.finalScore - a.finalScore);
  const used = new Set<string>();

  const out: Record<Section, NewsletterTopicCandidate[]> = {
    top_stories: [],
    infra_watch: [],
    research: [],
    quick_hits: [],
  };

  // 1. top_stories — top N by score, any event_type
  for (const c of sorted) {
    if (out.top_stories.length >= SECTION_LIMITS.top_stories) break;
    out.top_stories.push(c);
    used.add(c.topicId);
  }

  // 2. infra_watch — qualifying event_type, not already used
  for (const c of sorted) {
    if (used.has(c.topicId)) continue;
    if (out.infra_watch.length >= SECTION_LIMITS.infra_watch) break;
    if (c.eventType && INFRA_EVENT_TYPES.has(c.eventType)) {
      out.infra_watch.push(c);
      used.add(c.topicId);
    }
  }

  // 3. research — research/analysis event_type OR arxiv source
  for (const c of sorted) {
    if (used.has(c.topicId)) continue;
    if (out.research.length >= SECTION_LIMITS.research) break;
    if ((c.eventType && RESEARCH_EVENT_TYPES.has(c.eventType)) || c.hasArxiv) {
      out.research.push(c);
      used.add(c.topicId);
    }
  }

  // 4. quick_hits — leftovers, score order
  for (const c of sorted) {
    if (used.has(c.topicId)) continue;
    if (out.quick_hits.length >= SECTION_LIMITS.quick_hits) break;
    out.quick_hits.push(c);
    used.add(c.topicId);
  }

  return out;
}
