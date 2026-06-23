/**
 * Newsletter LLM prompt + structured response parser.
 *
 * Given a bucketed set of topics, ask the LLM to produce:
 *   - a punchy bilingual title + subject line
 *   - per-section prose (3-5 sentences for narrative sections, 1 sentence
 *     per quick_hit) — both EN and ZH
 *
 * We then ASSEMBLE the markdown ourselves from the LLM output + topic data,
 * so the link list, source attribution, and ordering are deterministic and
 * the LLM only writes the parts that need taste (titles, blurbs).
 *
 * Cost: one chat call per draft (~3-5K input + ~1.5K output tokens on
 * gpt-4o-mini ≈ $0.001 per draft).
 */

import OpenAI from "openai";
import type { NewsletterTopicCandidate, Section } from "./select";
import { SECTION_LABELS, SECTION_LIMITS, SECTION_ORDER } from "./select";

export const PROMPT_VERSION = "nl-v1-2026-06-23";
export const DEFAULT_MODEL = process.env.OPENAI_ENRICH_MODEL ?? "gpt-4o-mini";

const SYSTEM_PROMPT = `You are the editor of a weekly bilingual (English + Chinese) AI
intelligence newsletter for engineers and product folks who BUILD with LLMs.

Tone: confident, skeptical, dense. No marketing fluff, no "in this exciting
post". Treat readers as informed practitioners.

You will receive a JSON payload describing 4 sections and the topic clusters
that belong to each. For each section you must produce:
  - For "top_stories", "infra_watch", "research": one 2-4 sentence editorial
    blurb (en AND zh) that frames the section and calls out what to notice.
  - For "quick_hits": one ≤25-word one-liner per topic (en AND zh), each
    leading with the actual news (e.g. "OpenAI shipped X — Y matters because Z").
  - For the newsletter as a whole: a short title (≤8 words EN, ≤14 chars ZH)
    and a subject line (≤60 chars EN, ≤25 chars ZH). The title is for the
    page header; the subject line is for email.

Chinese MUST be natural 中文 — not literal translation of the English.
Use 中文标点 in Chinese sections.

Return JSON only, matching the provided schema. Do not invent topics
beyond those provided. If a section has zero topics, return an empty
blurb / empty quick_hits array for it.`;

// JSON Schema (strict mode for OpenAI structured output)
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title_en: { type: "string" },
    title_zh: { type: "string" },
    subject_en: { type: "string" },
    subject_zh: { type: "string" },
    sections: {
      type: "object",
      additionalProperties: false,
      properties: {
        top_stories: { $ref: "#/$defs/narrativeSection" },
        infra_watch: { $ref: "#/$defs/narrativeSection" },
        research: { $ref: "#/$defs/narrativeSection" },
        quick_hits: {
          type: "object",
          additionalProperties: false,
          properties: {
            blurb_en: { type: "string" },
            blurb_zh: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  topic_id: { type: "string" },
                  one_liner_en: { type: "string" },
                  one_liner_zh: { type: "string" },
                },
                required: ["topic_id", "one_liner_en", "one_liner_zh"],
              },
            },
          },
          required: ["blurb_en", "blurb_zh", "items"],
        },
      },
      required: ["top_stories", "infra_watch", "research", "quick_hits"],
    },
  },
  required: ["title_en", "title_zh", "subject_en", "subject_zh", "sections"],
  $defs: {
    narrativeSection: {
      type: "object",
      additionalProperties: false,
      properties: {
        blurb_en: { type: "string" },
        blurb_zh: { type: "string" },
      },
      required: ["blurb_en", "blurb_zh"],
    },
  },
} as const;

export interface NarrativeBlurb {
  blurb_en: string;
  blurb_zh: string;
}

export interface QuickHitItem {
  topic_id: string;
  one_liner_en: string;
  one_liner_zh: string;
}

export interface NewsletterLLMOutput {
  title_en: string;
  title_zh: string;
  subject_en: string;
  subject_zh: string;
  sections: {
    top_stories: NarrativeBlurb;
    infra_watch: NarrativeBlurb;
    research: NarrativeBlurb;
    quick_hits: NarrativeBlurb & { items: QuickHitItem[] };
  };
}

/**
 * Build the user prompt payload as compact JSON. We pass just enough per
 * topic for the LLM to write a section blurb: the title, the primary
 * article + 1-line summary, supporting article titles, tags, score.
 */
export function buildUserPrompt(
  buckets: Record<Section, NewsletterTopicCandidate[]>,
  windowDays: number
): string {
  const payload = {
    instruction: "Write the bilingual newsletter for the topics below.",
    window_days: windowDays,
    section_limits: SECTION_LIMITS,
    sections: Object.fromEntries(
      SECTION_ORDER.map((s) => [
        s,
        {
          label_en: SECTION_LABELS[s].en,
          label_zh: SECTION_LABELS[s].zh,
          topics: buckets[s].map(serialiseTopicForPrompt),
        },
      ])
    ),
  };
  return JSON.stringify(payload, null, 2);
}

function serialiseTopicForPrompt(t: NewsletterTopicCandidate) {
  return {
    topic_id: t.topicId,
    title: t.topicTitleEn ?? t.primaryArticle.title,
    final_score: t.finalScore,
    article_count: t.articleCount,
    event_type: t.eventType,
    primary: {
      title: t.primaryArticle.title,
      source: t.primaryArticle.sourceName,
      url: t.primaryArticle.url,
      summary: t.primaryArticle.summaryEn ?? "",
      why_it_matters: t.primaryArticle.whyItMattersEn ?? "",
      newsletter_angle: t.primaryArticle.newsletterAngleEn ?? "",
      tags: t.primaryArticle.tags,
    },
    supporting: t.supportingArticles.slice(0, 4).map((a) => ({
      title: a.title,
      source: a.sourceName,
      url: a.url,
    })),
  };
}

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const baseURL = process.env.OPENAI_BASE_URL || undefined;
  _client = new OpenAI({ apiKey, baseURL });
  return _client;
}

export interface NewsletterCallMeta {
  model: string;
  promptVersion: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}

export async function callNewsletterLLM(
  buckets: Record<Section, NewsletterTopicCandidate[]>,
  windowDays: number,
  opts: { model?: string; timeoutMs?: number } = {}
): Promise<{ result: NewsletterLLMOutput; meta: NewsletterCallMeta }> {
  const model = opts.model ?? DEFAULT_MODEL;
  const t0 = Date.now();

  // gpt-5.x via LiteLLM forces temperature=1; omit for those.
  const supportsLowTemp = !/^gpt-5/i.test(model);

  const resp = await client().chat.completions.create(
    {
      model,
      ...(supportsLowTemp ? { temperature: 0.5 } : {}),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(buckets, windowDays) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "newsletter_draft",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
    },
    { timeout: opts.timeoutMs ?? 120_000 }
  );

  const raw = resp.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned empty newsletter content");
  const parsed = JSON.parse(raw) as NewsletterLLMOutput;
  validateLLMOutput(parsed, buckets);

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

/**
 * Sanity-check the LLM output: every quick_hits item must reference a topic
 * we actually fed in (no hallucinated IDs). Other fields just need to exist.
 */
export function validateLLMOutput(
  output: NewsletterLLMOutput,
  buckets: Record<Section, NewsletterTopicCandidate[]>
): void {
  const validIds = new Set<string>();
  for (const section of SECTION_ORDER) {
    for (const t of buckets[section]) validIds.add(t.topicId);
  }
  for (const item of output.sections.quick_hits.items) {
    if (!validIds.has(item.topic_id)) {
      throw new Error(
        `LLM returned quick_hits item with unknown topic_id=${item.topic_id}`
      );
    }
  }
}
