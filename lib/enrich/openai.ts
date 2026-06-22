/**
 * OpenAI enrichment — given an article (title + content + source meta),
 * return a structured analysis we can write into `article_insights`.
 *
 * Model: gpt-4o-mini (cost-optimised; ~$0.50 for 2k articles at ~500/300 tokens)
 * Schema-enforced via `response_format: json_schema` with strict mode.
 */

import OpenAI from "openai";
import type { Article, Source } from "@/lib/db/schema";

export const PROMPT_VERSION = "v1-2026-06-22";
// Default model resolved at runtime from env so we can switch providers without
// touching code. Set OPENAI_ENRICH_MODEL to override (default: gpt-4o-mini).
export const DEFAULT_MODEL = process.env.OPENAI_ENRICH_MODEL ?? "gpt-4o-mini";

const SYSTEM_PROMPT = `You are an AI industry analyst writing for a bilingual (EN/ZH)
weekly newsletter aimed at engineers and product folks working with LLMs.

For each article you analyse, return a JSON object matching the provided schema.
Rules:
- Be precise and skeptical. If the article is a press release, marketing post,
  or low-signal community discussion, score it accordingly (importance 1-3).
- Reserve importance 8-10 for major model releases, significant research with
  clear empirical results, or industry-shifting infra/policy news.
- Summaries should be FACTUAL and DENSE (no fluff like "in this exciting post").
- Chinese summaries should be natural 中文, not literal translation of English.
- event_type must be one of: model_release | research | product_update |
  funding | analysis | tool | community | policy | other
- tags: 3-6 lowercase, hyphenated keywords (e.g. "agentic-workflows",
  "rag", "open-source", "alignment", "evals").
- why_it_matters_en/zh: ONE sentence each, explaining the SO-WHAT for an
  engineer building with LLMs.
- newsletter_angle_en: 1 sentence suggesting how this could appear in a
  newsletter (e.g. "Lead with the benchmark table; contrast with X's claims").
- key_points: 2-4 bullet-style facts, each <100 chars.
- entities: up to 6 named things (models, companies, papers, people).
- confidence: 0-1 — how confident the model is in its analysis given the
  available content. Low (<0.4) if the article is just a slug/title with no body.`;

// JSON Schema for OpenAI structured output (strict mode)
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    one_sentence_summary: { type: "string" },
    summary_en: { type: "string" },
    summary_zh: { type: "string" },
    key_points: { type: "array", items: { type: "string" }, maxItems: 4 },
    entities: { type: "array", items: { type: "string" }, maxItems: 6 },
    event_type: {
      type: "string",
      enum: [
        "model_release",
        "research",
        "product_update",
        "funding",
        "analysis",
        "tool",
        "community",
        "policy",
        "other",
      ],
    },
    predicted_category: {
      type: "string",
      enum: ["models", "infra", "agents", "research", "community", "media", "other"],
    },
    predicted_tags: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
    why_it_matters_en: { type: "string" },
    why_it_matters_zh: { type: "string" },
    newsletter_angle_en: { type: "string" },
    importance_score: { type: "integer", minimum: 1, maximum: 10 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "one_sentence_summary",
    "summary_en",
    "summary_zh",
    "key_points",
    "entities",
    "event_type",
    "predicted_category",
    "predicted_tags",
    "why_it_matters_en",
    "why_it_matters_zh",
    "newsletter_angle_en",
    "importance_score",
    "confidence",
  ],
} as const;

export interface EnrichmentResult {
  one_sentence_summary: string;
  summary_en: string;
  summary_zh: string;
  key_points: string[];
  entities: string[];
  event_type: string;
  predicted_category: string;
  predicted_tags: string[];
  why_it_matters_en: string;
  why_it_matters_zh: string;
  newsletter_angle_en: string;
  importance_score: number;
  confidence: number;
}

export interface EnrichmentMeta {
  model: string;
  promptVersion: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  // Allow pointing at any OpenAI-compatible gateway (LiteLLM, OpenRouter, etc.)
  // via OPENAI_BASE_URL. Default falls back to the official OpenAI endpoint.
  const baseURL = process.env.OPENAI_BASE_URL || undefined;
  _client = new OpenAI({ apiKey, baseURL });
  return _client;
}

/**
 * Build the user-facing prompt for a single article. Trim content to ~2500 chars
 * so each call stays well under cost-per-row sanity limits.
 */
export function buildUserPrompt(article: Article, source: Source): string {
  const content = (article.contentRaw ?? article.summaryRaw ?? "").slice(0, 2500);
  const published =
    article.publishedAt instanceof Date
      ? article.publishedAt.toISOString().slice(0, 10)
      : "unknown";
  return [
    `Source: ${source.name} (${source.category ?? "uncategorised"}, tier ${source.tier})`,
    `Published: ${published}`,
    `URL: ${article.url}`,
    `Title: ${article.title}`,
    "",
    `Content:`,
    content || "(no body content available — analyse from title + source context)",
  ].join("\n");
}

export async function enrichArticle(
  article: Article,
  source: Source,
  opts: { model?: string; timeoutMs?: number } = {}
): Promise<{ result: EnrichmentResult; meta: EnrichmentMeta }> {
  const model = opts.model ?? DEFAULT_MODEL;
  const t0 = Date.now();

  // gpt-5.x models only support temperature=1 (LiteLLM enforces this).
  // Omit the param entirely for gpt-5.* — the model will use its default.
  const supportsLowTemp = !/^gpt-5/i.test(model);

  const resp = await client().chat.completions.create(
    {
      model,
      ...(supportsLowTemp ? { temperature: 0.3 } : {}),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(article, source) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "article_insight",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
    },
    { timeout: opts.timeoutMs ?? 60_000 }
  );

  const raw = resp.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned empty content");
  const parsed = JSON.parse(raw) as EnrichmentResult;

  return {
    result: parsed,
    meta: {
      model,
      promptVersion: PROMPT_VERSION,
      inputTokens: resp.usage?.prompt_tokens,
      outputTokens: resp.usage?.completion_tokens,
      latencyMs: Date.now() - t0,
    },
  };
}
