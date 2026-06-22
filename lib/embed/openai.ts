/**
 * Embedding generation — wraps OpenAI/LiteLLM embeddings endpoint.
 *
 * Defaults to text-embedding-3-large with dimensions=1536 to match our
 * pgvector column. Override via env:
 *   OPENAI_EMBED_MODEL      (default: text-embedding-3-large)
 *   OPENAI_EMBED_DIMENSIONS (default: 1536)
 *
 * Uses the same OPENAI_API_KEY / OPENAI_BASE_URL as the chat enrichment
 * module so we can route through LiteLLM with one set of env vars.
 */

import OpenAI from "openai";

export const DEFAULT_MODEL = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-large";
export const DEFAULT_DIMENSIONS = parseInt(process.env.OPENAI_EMBED_DIMENSIONS ?? "1536", 10);

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const baseURL = process.env.OPENAI_BASE_URL || undefined;
  _client = new OpenAI({ apiKey, baseURL });
  return _client;
}

export interface EmbedResult {
  embeddings: number[][];
  inputTokens: number;
  model: string;
  dimensions: number;
  latencyMs: number;
}

/**
 * Embed an array of strings in a single API call. Returns vectors in input order.
 * Throws on API failure; caller is responsible for retry/skip logic.
 */
export async function embedBatch(
  inputs: string[],
  opts: { model?: string; dimensions?: number; timeoutMs?: number } = {}
): Promise<EmbedResult> {
  if (inputs.length === 0) {
    return { embeddings: [], inputTokens: 0, model: DEFAULT_MODEL, dimensions: DEFAULT_DIMENSIONS, latencyMs: 0 };
  }
  const model = opts.model ?? DEFAULT_MODEL;
  const dimensions = opts.dimensions ?? DEFAULT_DIMENSIONS;
  const t0 = Date.now();

  // text-embedding-3-* supports the `dimensions` param to truncate output.
  // ada-002 does not — only pass it for v3+ models.
  const supportsDimensions = /text-embedding-3-/.test(model);

  const resp = await client().embeddings.create(
    {
      model,
      input: inputs,
      ...(supportsDimensions ? { dimensions } : {}),
    },
    { timeout: opts.timeoutMs ?? 60_000 }
  );

  // Sort by index (OpenAI guarantees order, but be defensive)
  const sorted = [...resp.data].sort((a, b) => a.index - b.index);
  const embeddings = sorted.map((d) => d.embedding);

  // Sanity check — actual dim should match requested for v3, or 1536/3072 for ada/v3-large
  if (embeddings[0] && supportsDimensions && embeddings[0].length !== dimensions) {
    throw new Error(
      `embedding dim mismatch: requested ${dimensions}, got ${embeddings[0].length}`
    );
  }

  return {
    embeddings,
    inputTokens: resp.usage?.prompt_tokens ?? 0,
    model,
    dimensions: embeddings[0]?.length ?? dimensions,
    latencyMs: Date.now() - t0,
  };
}

/**
 * Compose the embedding input for an article. We combine:
 *   - title (strongest signal)
 *   - one_sentence_summary or summary_en (if enriched)
 *   - first 800 chars of contentRaw/summaryRaw as fallback
 *
 * This gives a focused ~200-token document that captures topic semantics
 * better than title alone, without paying for the full article body.
 */
export function buildEmbeddingInput(article: {
  title: string;
  summaryEn?: string | null;
  oneSentenceSummary?: string | null;
  summaryRaw?: string | null;
  contentRaw?: string | null;
}): string {
  const parts: string[] = [article.title];
  // Prefer LLM-generated summary; fall back to raw content
  const semantic =
    article.oneSentenceSummary ??
    article.summaryEn ??
    article.summaryRaw ??
    article.contentRaw?.slice(0, 800);
  if (semantic) parts.push(semantic.slice(0, 800));
  return parts.join("\n\n");
}
