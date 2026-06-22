import { XMLParser } from "fast-xml-parser";
import { canonicalizeUrl, titleHash, urlHash } from "../dedup";
import type { NewArticle, Source } from "../../db/schema";
import type { FetchAdapter, FetchResult } from "../types";

const USER_AGENT =
  "ai-radar/0.1 (+https://github.com/weekend-ai/ai-radar; contact via GitHub issues)";

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

/**
 * Sitemap adapter — for sites that don't expose RSS but publish a sitemap.xml
 * with `<lastmod>` timestamps. Example: Anthropic's /news/ and /engineering/.
 *
 * Source config conventions:
 *   - `url`            full sitemap URL (e.g. https://www.anthropic.com/sitemap.xml)
 *   - `tags`           must include "sitemap:prefix=/news/" — the URL prefix
 *                      this source claims (case-insensitive substring match).
 *                      Optional "sitemap:limit=N" caps how many newest entries
 *                      we ingest per fetch (default 50).
 *
 * Behaviour:
 *   - Pulls all <url><loc> entries, filters by prefix.
 *   - Sorts by <lastmod> descending; takes top N.
 *   - Synthesizes a title from the URL slug (LLM enrichment will overwrite).
 *   - publishedAt = lastmod.
 *
 * We deliberately do NOT fetch every detail page during sitemap parsing —
 * that's expensive. Day 5's enrichment step will pull og:title + content
 * for high-scoring candidates. Dedup uses hash_url so titles changing later
 * doesn't cause duplicates.
 */
export const sitemapAdapter: FetchAdapter = {
  type: "sitemap",
  async fetch(source: Source): Promise<FetchResult> {
    try {
      const tagMap = parseTagOptions(source.tags as string[] | null);
      const prefix = tagMap["sitemap:prefix"];
      if (!prefix) {
        return {
          source,
          articles: [],
          fetchedCount: 0,
          error:
            "sitemap source missing required tag 'sitemap:prefix=/path/' — cannot filter entries",
        };
      }
      const limit = parseInt(tagMap["sitemap:limit"] ?? "50", 10);

      const res = await fetchWithTimeout(source.url, 30_000);
      if (!res.ok) {
        return {
          source,
          articles: [],
          fetchedCount: 0,
          error: `HTTP ${res.status} ${res.statusText}`,
        };
      }
      const body = await res.text();
      const parsed = xml.parse(body);

      // Standard sitemap shape: { urlset: { url: [ { loc, lastmod }, ... ] } }
      const urlsetRaw = parsed?.urlset?.url;
      if (!urlsetRaw) {
        return {
          source,
          articles: [],
          fetchedCount: 0,
          error: "no <urlset><url> entries in sitemap (is it a sitemap index?)",
        };
      }
      const urls: Array<{ loc?: string; lastmod?: string }> = Array.isArray(urlsetRaw)
        ? urlsetRaw
        : [urlsetRaw];

      const lowerPrefix = prefix.toLowerCase();
      const filtered = urls
        .filter((u) => typeof u?.loc === "string" && u.loc.toLowerCase().includes(lowerPrefix))
        .map((u) => ({
          loc: u.loc as string,
          lastmod: u.lastmod ? new Date(u.lastmod) : null,
        }))
        .filter((u) => u.lastmod && !isNaN(u.lastmod.getTime()))
        .sort((a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0))
        .slice(0, limit);

      const articles: NewArticle[] = filtered.map((entry) => {
        const title = slugToTitle(entry.loc, prefix);
        const canonical = canonicalizeUrl(entry.loc);
        return {
          sourceId: source.id,
          externalId: entry.loc,
          url: entry.loc,
          canonicalUrl: canonical,
          title,
          author: null,
          summaryRaw: null,
          contentRaw: null,
          publishedAt: entry.lastmod,
          language: null,
          status: "new",
          hashUrl: urlHash(entry.loc),
          hashTitle: titleHash(title),
          hashContent: null,
        };
      });

      return { source, articles, fetchedCount: filtered.length };
    } catch (err) {
      return {
        source,
        articles: [],
        fetchedCount: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

function parseTagOptions(tags: string[] | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!tags) return out;
  for (const t of tags) {
    const idx = t.indexOf("=");
    if (idx > 0) out[t.slice(0, idx)] = t.slice(idx + 1);
  }
  return out;
}

/** Derive a human-readable title from a slug like /news/3-5-models-and-computer-use */
function slugToTitle(url: string, prefix: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const idx = path.toLowerCase().indexOf(prefix.toLowerCase());
    const tail = idx >= 0 ? path.slice(idx + prefix.length) : path;
    const slug = tail.replace(/^\/+|\/+$/g, "");
    if (!slug) return path;
    return slug
      .split("-")
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  } catch {
    return url;
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/xml, text/xml, */*",
      },
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}
