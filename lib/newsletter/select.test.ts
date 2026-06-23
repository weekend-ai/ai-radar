import { describe, it, expect } from "vitest";
import {
  foldJoinedRows,
  bucketTopics,
  SECTION_LIMITS,
  type JoinedTopicRow,
  type NewsletterTopicCandidate,
} from "./select";

function row(
  topicId: string,
  articleId: string,
  opts: {
    title?: string;
    finalScore?: number;
    importance?: number;
    eventType?: string | null;
    sourceSlug?: string;
    articleCount?: number;
  } = {}
): JoinedTopicRow {
  return {
    topic: {
      id: topicId,
      titleEn: `Topic ${topicId}`,
      summaryEn: null,
      finalScore: opts.finalScore ?? 5,
      articleCount: opts.articleCount ?? 2,
      firstSeenAt: null,
      lastSeenAt: null,
    },
    article: {
      id: articleId,
      title: opts.title ?? `Article ${articleId}`,
      url: `https://example.com/${articleId}`,
      publishedAt: null,
    },
    source: {
      id: opts.sourceSlug ?? "openai-blog",
      name: opts.sourceSlug ?? "openai-blog",
    },
    insight: {
      importanceScore: opts.importance ?? 5,
      summaryEn: `Summary ${articleId}`,
      whyItMattersEn: null,
      newsletterAngleEn: null,
      predictedTags: ["llm"],
      eventType: opts.eventType ?? "analysis",
    },
  };
}

describe("foldJoinedRows", () => {
  it("groups members by topic and promotes highest-importance to primary", () => {
    const rows: JoinedTopicRow[] = [
      row("T1", "A1", { importance: 5 }),
      row("T1", "A2", { importance: 9 }),
      row("T1", "A3", { importance: 7 }),
    ];
    const cands = foldJoinedRows(rows);
    expect(cands).toHaveLength(1);
    expect(cands[0].primaryArticle.articleId).toBe("A2");
    expect(cands[0].supportingArticles.map((a) => a.articleId)).toEqual(["A3", "A1"]);
  });

  it("flags arxiv when any member source slug starts with 'arxiv-'", () => {
    const rows: JoinedTopicRow[] = [
      row("T1", "A1", { sourceSlug: "openai-blog" }),
      row("T1", "A2", { sourceSlug: "arxiv-cs-ai" }),
    ];
    const [cand] = foldJoinedRows(rows);
    expect(cand.hasArxiv).toBe(true);
  });

  it("picks mode event_type with primary article as tiebreaker", () => {
    const rows: JoinedTopicRow[] = [
      row("T1", "A1", { importance: 9, eventType: "model_release" }),
      row("T1", "A2", { importance: 8, eventType: "analysis" }),
      row("T1", "A3", { importance: 7, eventType: "analysis" }),
    ];
    // analysis (2) wins over model_release (1)
    const [cand] = foldJoinedRows(rows);
    expect(cand.eventType).toBe("analysis");
  });

  it("returns null event_type when no insights have one", () => {
    const rows: JoinedTopicRow[] = [
      { ...row("T1", "A1"), insight: null },
      { ...row("T1", "A2"), insight: null },
    ];
    const [cand] = foldJoinedRows(rows);
    expect(cand.eventType).toBe(null);
  });
});

function mkCand(
  id: string,
  opts: { finalScore: number; eventType?: string | null; hasArxiv?: boolean } = {
    finalScore: 5,
  }
): NewsletterTopicCandidate {
  return {
    topicId: id,
    topicTitleEn: `Topic ${id}`,
    topicSummaryEn: null,
    finalScore: opts.finalScore,
    articleCount: 2,
    firstSeenAt: null,
    lastSeenAt: null,
    eventType: opts.eventType ?? "analysis",
    hasArxiv: opts.hasArxiv ?? false,
    primaryArticle: {
      articleId: `${id}-A1`,
      title: "x",
      url: "https://example.com",
      sourceName: "src",
      sourceSlug: "openai-blog",
      publishedAt: null,
      importanceScore: 5,
      summaryEn: "",
      whyItMattersEn: "",
      newsletterAngleEn: "",
      tags: [],
      eventType: opts.eventType ?? "analysis",
    },
    supportingArticles: [],
  };
}

describe("bucketTopics", () => {
  it("never assigns the same topic to two sections", () => {
    const cands = [
      mkCand("T1", { finalScore: 9, eventType: "model_release" }),
      mkCand("T2", { finalScore: 8, eventType: "product_update" }),
      mkCand("T3", { finalScore: 7, eventType: "research" }),
      mkCand("T4", { finalScore: 6, eventType: "tool" }),
      mkCand("T5", { finalScore: 5, eventType: "analysis" }),
      mkCand("T6", { finalScore: 4, eventType: "community" }),
    ];
    const buckets = bucketTopics(cands);
    const all = [
      ...buckets.top_stories,
      ...buckets.infra_watch,
      ...buckets.research,
      ...buckets.quick_hits,
    ];
    const ids = all.map((c) => c.topicId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fills top_stories first with highest-score topics regardless of event_type", () => {
    const cands = [
      mkCand("T1", { finalScore: 9, eventType: "model_release" }),
      mkCand("T2", { finalScore: 8, eventType: "model_release" }),
      mkCand("T3", { finalScore: 7, eventType: "model_release" }),
      mkCand("T4", { finalScore: 6, eventType: "model_release" }),
    ];
    const buckets = bucketTopics(cands);
    expect(buckets.top_stories.map((c) => c.topicId)).toEqual(["T1", "T2", "T3"]);
    // T4 goes to infra_watch (model_release qualifies)
    expect(buckets.infra_watch[0].topicId).toBe("T4");
  });

  it("respects per-section limits", () => {
    const cands = Array.from({ length: 20 }, (_, i) =>
      mkCand(`T${i}`, { finalScore: 20 - i, eventType: "analysis" })
    );
    const buckets = bucketTopics(cands);
    expect(buckets.top_stories.length).toBe(SECTION_LIMITS.top_stories);
    expect(buckets.research.length).toBe(SECTION_LIMITS.research);
    expect(buckets.quick_hits.length).toBe(SECTION_LIMITS.quick_hits);
    // infra_watch needs qualifying event_type; "analysis" doesn't qualify so 0
    expect(buckets.infra_watch.length).toBe(0);
  });

  it("routes arxiv-sourced topics to research even without research event_type", () => {
    const cands = [
      mkCand("T1", { finalScore: 9, eventType: "analysis" }),
      mkCand("T2", { finalScore: 8, eventType: "analysis" }),
      mkCand("T3", { finalScore: 7, eventType: "analysis" }),
      // After top_stories fills T1-T3, this one with hasArxiv goes to research
      mkCand("T4", { finalScore: 6, eventType: "other", hasArxiv: true }),
    ];
    const buckets = bucketTopics(cands);
    expect(buckets.research.map((c) => c.topicId)).toContain("T4");
  });
});
