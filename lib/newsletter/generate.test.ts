import { describe, it, expect } from "vitest";
import { assembleMarkdown } from "./generate";
import type { Section } from "./select";
import type { NewsletterLLMOutput } from "./prompt";
import type { NewsletterTopicCandidate } from "./select";

function mkCand(
  id: string,
  opts: Partial<NewsletterTopicCandidate> = {}
): NewsletterTopicCandidate {
  const base: NewsletterTopicCandidate = {
    topicId: id,
    topicTitleEn: `Topic ${id}`,
    topicSummaryEn: null,
    finalScore: 7,
    articleCount: 2,
    firstSeenAt: null,
    lastSeenAt: null,
    eventType: "analysis",
    hasArxiv: false,
    primaryArticle: {
      articleId: `${id}-A1`,
      title: `${id} primary article`,
      url: `https://example.com/${id}-A1`,
      sourceName: "OpenAI Blog",
      sourceSlug: "openai-blog",
      publishedAt: null,
      importanceScore: 7,
      summaryEn: `${id} summary text.`,
      whyItMattersEn: `${id} matters because.`,
      newsletterAngleEn: null,
      tags: ["llm"],
      eventType: "analysis",
    },
    supportingArticles: [
      {
        articleId: `${id}-A2`,
        title: `${id} supporting article`,
        url: `https://example.com/${id}-A2`,
        sourceName: "TechCrunch AI",
        sourceSlug: "techcrunch-ai",
        publishedAt: null,
        importanceScore: 5,
        summaryEn: null,
        whyItMattersEn: null,
        newsletterAngleEn: null,
        tags: [],
        eventType: null,
      },
    ],
  };
  return { ...base, ...opts };
}

const emptyBuckets: Record<Section, NewsletterTopicCandidate[]> = {
  top_stories: [],
  infra_watch: [],
  research: [],
  quick_hits: [],
};

const baseLLM: NewsletterLLMOutput = {
  title_en: "Weekly AI Pulse",
  title_zh: "AI 周报",
  subject_en: "This week in AI",
  subject_zh: "本周 AI",
  sections: {
    top_stories: { blurb_en: "Top stories blurb EN", blurb_zh: "头条要闻 ZH" },
    infra_watch: { blurb_en: "Infra blurb EN", blurb_zh: "基础设施 ZH" },
    research: { blurb_en: "Research blurb EN", blurb_zh: "研究 ZH" },
    quick_hits: { blurb_en: "Quick hits blurb EN", blurb_zh: "快讯 ZH", items: [] },
  },
};

const ctx = {
  windowDays: 7,
  since: new Date("2026-06-16T00:00:00Z"),
  until: new Date("2026-06-23T00:00:00Z"),
};

describe("assembleMarkdown", () => {
  it("includes both English title and Chinese title in header", () => {
    const md = assembleMarkdown(baseLLM, emptyBuckets, ctx);
    expect(md).toMatch(/^# Weekly AI Pulse/);
    expect(md).toContain("### AI 周报");
  });

  it("skips sections with zero topics entirely", () => {
    const md = assembleMarkdown(baseLLM, emptyBuckets, ctx);
    expect(md).not.toContain("## Top Stories");
    expect(md).not.toContain("## Quick Hits");
  });

  it("renders narrative sections with blurb + per-topic block + link list", () => {
    const md = assembleMarkdown(
      baseLLM,
      { ...emptyBuckets, top_stories: [mkCand("T1")] },
      ctx
    );
    expect(md).toContain("## Top Stories · 头条要闻");
    expect(md).toContain("Top stories blurb EN");
    expect(md).toContain("> 头条要闻 ZH");
    expect(md).toContain("### Topic T1");
    expect(md).toContain("T1 summary text.");
    expect(md).toContain("**Why it matters:** T1 matters because.");
    // Primary + supporting links
    expect(md).toContain("(https://example.com/T1-A1)");
    expect(md).toContain("(https://example.com/T1-A2)");
  });

  it("renders quick_hits as one-line items using LLM ordering", () => {
    const buckets = {
      ...emptyBuckets,
      quick_hits: [mkCand("T1"), mkCand("T2")],
    };
    const llm: NewsletterLLMOutput = {
      ...baseLLM,
      sections: {
        ...baseLLM.sections,
        quick_hits: {
          blurb_en: "Quick hits blurb EN",
          blurb_zh: "快讯 ZH",
          items: [
            { topic_id: "T2", one_liner_en: "T2 one-liner EN", one_liner_zh: "T2 一句话" },
            { topic_id: "T1", one_liner_en: "T1 one-liner EN", one_liner_zh: "T1 一句话" },
          ],
        },
      },
    };
    const md = assembleMarkdown(llm, buckets, ctx);
    // LLM ordering wins
    const t1Idx = md.indexOf("T1 one-liner EN");
    const t2Idx = md.indexOf("T2 one-liner EN");
    expect(t2Idx).toBeGreaterThan(0);
    expect(t1Idx).toBeGreaterThan(t2Idx);
    expect(md).toContain("T1 一句话");
    expect(md).toContain("T2 一句话");
  });

  it("falls back to topic title when LLM omits a quick_hits item", () => {
    const buckets = {
      ...emptyBuckets,
      quick_hits: [mkCand("T1"), mkCand("T2")],
    };
    const llm: NewsletterLLMOutput = {
      ...baseLLM,
      sections: {
        ...baseLLM.sections,
        quick_hits: {
          blurb_en: "x",
          blurb_zh: "x",
          items: [
            { topic_id: "T1", one_liner_en: "only T1", one_liner_zh: "只 T1" },
          ],
        },
      },
    };
    const md = assembleMarkdown(llm, buckets, ctx);
    // T2 should still appear via fallback
    expect(md).toContain("Topic T2");
  });

  it("emits the date range + window in the header", () => {
    const md = assembleMarkdown(baseLLM, emptyBuckets, ctx);
    expect(md).toContain("2026-06-16");
    expect(md).toContain("2026-06-23");
    expect(md).toContain("7d window");
  });
});
