import { describe, expect, it } from "vitest";
import { sitemapAdapter } from "@/lib/fetcher/adapters/sitemap";
import type { Source } from "@/lib/db/schema";

const ANTHROPIC_SITEMAP_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url>
<loc>https://www.anthropic.com/</loc>
<lastmod>2026-06-22T11:00:00.000Z</lastmod>
</url>
<url>
<loc>https://www.anthropic.com/news/3-5-models-and-computer-use</loc>
<lastmod>2026-06-21T10:00:00.000Z</lastmod>
</url>
<url>
<loc>https://www.anthropic.com/news/100k-context-windows</loc>
<lastmod>2026-06-20T10:00:00.000Z</lastmod>
</url>
<url>
<loc>https://www.anthropic.com/careers</loc>
<lastmod>2026-06-15T10:00:00.000Z</lastmod>
</url>
<url>
<loc>https://www.anthropic.com/engineering/claude-code-best-practices</loc>
<lastmod>2026-06-19T10:00:00.000Z</lastmod>
</url>
</urlset>`;

function source(tags: string[], url = "https://example.com/sitemap.xml"): Source {
  return {
    id: "test",
    name: "Test",
    url,
    type: "sitemap",
    category: "models",
    tier: 1,
    enabled: true,
    priority: "high",
    weight: 30,
    description: null,
    tags,
    refreshIntervalMinutes: 60,
    lastFetchedAt: null,
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    articleCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("sitemapAdapter", () => {
  it("returns error when prefix tag is missing", async () => {
    const r = await sitemapAdapter.fetch(source([]));
    expect(r.error).toMatch(/sitemap:prefix/);
    expect(r.articles).toHaveLength(0);
  });

  it("filters by /news/ prefix and parses lastmod", async () => {
    // Stub global fetch for this test only
    const orig = global.fetch;
    global.fetch = (async () =>
      new Response(ANTHROPIC_SITEMAP_FIXTURE, {
        status: 200,
        headers: { "content-type": "application/xml" },
      })) as typeof global.fetch;

    try {
      const r = await sitemapAdapter.fetch(source(["sitemap:prefix=/news/"]));
      expect(r.error).toBeUndefined();
      expect(r.articles).toHaveLength(2); // only /news/ entries
      expect(r.articles[0].url).toContain("/news/3-5-models");
      expect(r.articles[0].publishedAt?.toISOString().slice(0, 10)).toBe("2026-06-21");
      expect(r.articles[0].title).toBe("3 5 Models And Computer Use");
      // engineering and careers excluded
      expect(r.articles.find((a) => a.url.includes("/engineering/"))).toBeUndefined();
      expect(r.articles.find((a) => a.url.includes("/careers"))).toBeUndefined();
    } finally {
      global.fetch = orig;
    }
  });

  it("filters by /engineering/ prefix", async () => {
    const orig = global.fetch;
    global.fetch = (async () =>
      new Response(ANTHROPIC_SITEMAP_FIXTURE, { status: 200 })) as typeof global.fetch;
    try {
      const r = await sitemapAdapter.fetch(source(["sitemap:prefix=/engineering/"]));
      expect(r.articles).toHaveLength(1);
      expect(r.articles[0].url).toContain("/engineering/claude-code-best-practices");
    } finally {
      global.fetch = orig;
    }
  });

  it("honours sitemap:limit", async () => {
    const orig = global.fetch;
    global.fetch = (async () =>
      new Response(ANTHROPIC_SITEMAP_FIXTURE, { status: 200 })) as typeof global.fetch;
    try {
      const r = await sitemapAdapter.fetch(
        source(["sitemap:prefix=/news/", "sitemap:limit=1"])
      );
      expect(r.articles).toHaveLength(1);
      // newest first
      expect(r.articles[0].url).toContain("3-5-models");
    } finally {
      global.fetch = orig;
    }
  });
});
