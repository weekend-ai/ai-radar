/**
 * Batch enrichment runner — pulls un-enriched articles, calls OpenAI in
 * parallel (bounded concurrency), and writes results into article_insights.
 *
 * Idempotent: skips articles that already have a row in article_insights.
 */

import { db } from "@/lib/db/client";
import { articles, articleInsights, sources, type Article, type Source } from "@/lib/db/schema";
import { and, asc, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { enrichArticle, type EnrichmentMeta, type EnrichmentResult } from "./openai";

export interface EnrichSummary {
  attempted: number;
  enriched: number;
  skipped: number;
  failed: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estCostUsd: number;
  errors: Array<{ articleId: string; url: string; error: string }>;
}

// gpt-4o-mini pricing (per 1M tokens) as of 2026-06
const COST_INPUT_PER_M = 0.15;
const COST_OUTPUT_PER_M = 0.60;

export async function enrichPending(opts: {
  limit?: number;
  concurrency?: number;
  model?: string;
  /** If true, only enrich articles whose source.tier <= maxTier */
  maxTier?: number;
  /** If true, only enrich articles whose source.priority is in the list */
  priorities?: string[];
} = {}): Promise<EnrichSummary> {
  const { limit = 100, concurrency = 5, model, maxTier, priorities } = opts;

  // Find articles with no insight row yet, preferring newest first.
  // We use a NOT EXISTS pattern via a LEFT JOIN check.
  const candidates = await db
    .select({
      article: articles,
      source: sources,
    })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .leftJoin(articleInsights, eq(articleInsights.articleId, articles.id))
    .where(
      and(
        isNull(articleInsights.id),
        // Skip articles with no usable content at all
        sql`(${articles.contentRaw} IS NOT NULL OR ${articles.summaryRaw} IS NOT NULL OR ${articles.title} IS NOT NULL)`,
        maxTier !== undefined ? sql`${sources.tier} <= ${maxTier}` : undefined,
        priorities && priorities.length > 0
          ? sql`${sources.priority} = ANY(${priorities})`
          : undefined
      )
    )
    .orderBy(sql`${articles.publishedAt} DESC NULLS LAST`)
    .limit(limit);

  if (candidates.length === 0) {
    return {
      attempted: 0,
      enriched: 0,
      skipped: 0,
      failed: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estCostUsd: 0,
      errors: [],
    };
  }

  const summary: EnrichSummary = {
    attempted: candidates.length,
    enriched: 0,
    skipped: 0,
    failed: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    estCostUsd: 0,
    errors: [],
  };

  // Manual bounded concurrency
  let cursor = 0;
  async function worker(workerIdx: number) {
    while (true) {
      const idx = cursor++;
      if (idx >= candidates.length) return;
      const { article, source } = candidates[idx];
      try {
        const { result, meta } = await enrichArticle(article, source, { model });
        await writeInsight(article, result, meta);
        summary.enriched += 1;
        summary.totalInputTokens += meta.inputTokens ?? 0;
        summary.totalOutputTokens += meta.outputTokens ?? 0;
        // Verbose per-row log so the CLI shows progress
        console.log(
          `  [w${workerIdx}] ${idx + 1}/${candidates.length} ✓ ${article.title.slice(0, 60)} ` +
            `(score=${result.importance_score}, ${meta.inputTokens ?? "?"}/${meta.outputTokens ?? "?"} tok, ${meta.latencyMs}ms)`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        summary.failed += 1;
        summary.errors.push({ articleId: article.id, url: article.url, error: msg });
        console.warn(
          `  [w${workerIdx}] ${idx + 1}/${candidates.length} ✗ ${article.title.slice(0, 60)} — ${msg}`
        );
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));

  summary.estCostUsd =
    (summary.totalInputTokens / 1_000_000) * COST_INPUT_PER_M +
    (summary.totalOutputTokens / 1_000_000) * COST_OUTPUT_PER_M;
  return summary;
}

async function writeInsight(
  article: Article,
  result: EnrichmentResult,
  meta: EnrichmentMeta
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(articleInsights)
      .values({
        articleId: article.id,
        oneSentenceSummary: result.one_sentence_summary,
        summaryEn: result.summary_en,
        summaryZh: result.summary_zh,
        keyPoints: result.key_points,
        entities: result.entities,
        eventType: result.event_type,
        predictedCategory: result.predicted_category,
        predictedTags: result.predicted_tags,
        whyItMattersEn: result.why_it_matters_en,
        whyItMattersZh: result.why_it_matters_zh,
        newsletterAngleEn: result.newsletter_angle_en,
        importanceScore: result.importance_score,
        confidence: String(result.confidence),
        model: meta.model,
        promptVersion: meta.promptVersion,
      })
      .onConflictDoNothing({ target: articleInsights.articleId });

    await tx
      .update(articles)
      .set({ status: "enriched", updatedAt: new Date() })
      .where(eq(articles.id, article.id));
  });
}
