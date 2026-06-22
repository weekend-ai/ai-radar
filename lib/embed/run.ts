/**
 * Batch embedding runner — pulls articles with NULL embedding, embeds in
 * batches via the embeddings API, writes vectors back via UPDATE.
 *
 * Strategy:
 *   - Pull candidates ordered by published_at DESC (newest first matters most)
 *   - Joined with article_insights so we can use the cleaner summary_en
 *   - Batch by N (default 64) — a single API call returns N vectors
 *   - Update each row individually after the batch (pgvector wants a single
 *     row update; multi-row VALUES would need raw SQL gymnastics)
 *
 * Idempotent — skips articles where embedded_at IS NOT NULL.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articles, articleInsights } from "@/lib/db/schema";
import { embedBatch, buildEmbeddingInput, DEFAULT_MODEL, DEFAULT_DIMENSIONS } from "./openai";

export interface EmbedRunSummary {
  attempted: number;
  embedded: number;
  failed: number;
  totalInputTokens: number;
  estCostUsd: number;
  batches: number;
  errors: Array<{ articleId: string; error: string }>;
}

// text-embedding-3-large pricing (per 1M tokens) as of 2026-06
const COST_PER_M_INPUT_3_LARGE = 0.13;
// text-embedding-3-small pricing fallback
const COST_PER_M_INPUT_3_SMALL = 0.02;

function costPerMillion(model: string): number {
  if (/3-large/.test(model)) return COST_PER_M_INPUT_3_LARGE;
  if (/3-small/.test(model)) return COST_PER_M_INPUT_3_SMALL;
  return COST_PER_M_INPUT_3_LARGE; // unknown — assume large
}

export async function embedPending(opts: {
  limit?: number;
  batchSize?: number;
  model?: string;
  dimensions?: number;
} = {}): Promise<EmbedRunSummary> {
  const { limit = 1000, batchSize = 64, model = DEFAULT_MODEL, dimensions = DEFAULT_DIMENSIONS } = opts;

  // Pull article fields + insight fields for richer embedding input.
  // We must use raw SQL for the IS NULL check on the vector column —
  // drizzle's standard isNull works but let's be explicit.
  const rows = await db.execute<{
    id: string;
    title: string;
    summary_en: string | null;
    one_sentence_summary: string | null;
    summary_raw: string | null;
    content_raw: string | null;
  }>(sql`
    SELECT
      a.id,
      a.title,
      i.summary_en,
      i.one_sentence_summary,
      a.summary_raw,
      a.content_raw
    FROM articles a
    LEFT JOIN article_insights i ON i.article_id = a.id
    WHERE a.embedding IS NULL
    ORDER BY a.published_at DESC NULLS LAST
    LIMIT ${limit}
  `);

  const candidates = Array.isArray(rows) ? rows : (rows as { rows: typeof rows }).rows ?? [];

  if (candidates.length === 0) {
    return {
      attempted: 0, embedded: 0, failed: 0, totalInputTokens: 0,
      estCostUsd: 0, batches: 0, errors: [],
    };
  }

  const summary: EmbedRunSummary = {
    attempted: candidates.length,
    embedded: 0,
    failed: 0,
    totalInputTokens: 0,
    estCostUsd: 0,
    batches: 0,
    errors: [],
  };

  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize);
    const inputs = batch.map((r) =>
      buildEmbeddingInput({
        title: r.title,
        summaryEn: r.summary_en,
        oneSentenceSummary: r.one_sentence_summary,
        summaryRaw: r.summary_raw,
        contentRaw: r.content_raw,
      })
    );

    try {
      const result = await embedBatch(inputs, { model, dimensions });
      summary.batches += 1;
      summary.totalInputTokens += result.inputTokens;

      // Write back — one UPDATE per row. Could batch with CASE WHEN but
      // 64 round-trips on a local socket is fast enough for now.
      for (let i = 0; i < batch.length; i++) {
        const articleId = batch[i].id;
        const vec = result.embeddings[i];
        if (!vec) {
          summary.failed += 1;
          summary.errors.push({ articleId, error: "no embedding returned for index" });
          continue;
        }
        try {
          await db.execute(sql`
            UPDATE articles
            SET embedding = ${`[${vec.join(",")}]`}::vector,
                embedded_at = NOW()
            WHERE id = ${articleId}
          `);
          summary.embedded += 1;
        } catch (err) {
          summary.failed += 1;
          summary.errors.push({
            articleId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      console.log(
        `  batch ${summary.batches}: ${batch.length} items, ${result.inputTokens} tok, ${result.latencyMs}ms`
      );
    } catch (err) {
      // Whole-batch failure — mark all as failed and continue
      const msg = err instanceof Error ? err.message : String(err);
      summary.failed += batch.length;
      batch.forEach((r) => summary.errors.push({ articleId: r.id, error: msg }));
      console.warn(`  batch ${summary.batches + 1} FAILED: ${msg}`);
    }
  }

  summary.estCostUsd = (summary.totalInputTokens / 1_000_000) * costPerMillion(model);
  return summary;
}
