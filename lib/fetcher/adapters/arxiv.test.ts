import { describe, expect, it } from "vitest";
import { arxivAdapter } from "@/lib/fetcher/adapters/arxiv";
import type { Source } from "@/lib/db/schema";

// Trimmed real arXiv API response (cs.AI, latest 2 entries)
const ARXIV_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <link href="http://arxiv.org/api/query" rel="self" type="application/atom+xml"/>
  <title type="html">ArXiv Query</title>
  <id>http://arxiv.org/api/abc</id>
  <updated>2026-06-22T00:00:00-04:00</updated>
  <opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">2</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2406.12345v1</id>
    <updated>2026-06-21T10:00:00Z</updated>
    <published>2026-06-21T10:00:00Z</published>
    <title>Scaling Laws for Sparse Attention in Long Context Models</title>
    <summary>We investigate the scaling behaviour of sparse attention mechanisms in
transformer language models over context lengths up to 1M tokens.
Our experiments show that sparsity confers significant compute savings
without measurable degradation on retrieval benchmarks.</summary>
    <author><name>Jane Researcher</name></author>
    <author><name>John Collaborator</name></author>
    <link href="http://arxiv.org/abs/2406.12345v1" rel="alternate" type="text/html"/>
    <category term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2406.67890v2</id>
    <updated>2026-06-20T12:00:00Z</updated>
    <published>2026-06-19T08:00:00Z</published>
    <title>A Survey of Tool-Using Language Models</title>
    <summary>A comprehensive survey of tool-using language models.</summary>
    <author><name>Solo Author</name></author>
    <link href="http://arxiv.org/abs/2406.67890v2" rel="alternate" type="text/html"/>
    <category term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

function source(): Source {
  return {
    id: "arxiv-cs-ai",
    name: "arXiv cs.AI",
    url: "https://example.com/api/query",
    type: "arxiv_api",
    category: "research",
    tier: 4,
    enabled: true,
    priority: "low",
    weight: 5,
    description: null,
    tags: [],
    refreshIntervalMinutes: 720,
    lastFetchedAt: null,
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    articleCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("arxivAdapter", () => {
  it("parses Atom entries into NewArticle rows", async () => {
    const orig = global.fetch;
    global.fetch = (async () =>
      new Response(ARXIV_FIXTURE, {
        status: 200,
        headers: { "content-type": "application/atom+xml" },
      })) as typeof global.fetch;

    try {
      const r = await arxivAdapter.fetch(source());
      expect(r.error).toBeUndefined();
      expect(r.articles).toHaveLength(2);

      const a0 = r.articles[0];
      expect(a0.title).toBe("Scaling Laws for Sparse Attention in Long Context Models");
      expect(a0.url).toBe("https://arxiv.org/abs/2406.12345v1");
      expect(a0.author).toBe("Jane Researcher, John Collaborator");
      expect(a0.publishedAt?.toISOString().slice(0, 10)).toBe("2026-06-21");
      expect(a0.summaryRaw).toContain("sparse attention");
      // whitespace collapsed
      expect(a0.summaryRaw).not.toMatch(/\n/);
      expect(a0.language).toBe("en");

      const a1 = r.articles[1];
      expect(a1.author).toBe("Solo Author");
    } finally {
      global.fetch = orig;
    }
  }, 10_000);
});
