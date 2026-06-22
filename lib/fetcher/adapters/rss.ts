import Parser from "rss-parser";
import { canonicalizeUrl, contentHash, titleHash, urlHash } from "../dedup";
import type { NewArticle, Source } from "../../db/schema";
import type { FetchAdapter, FetchResult } from "../types";

const USER_AGENT =
  "ai-radar/0.1 (+https://github.com/weekend-ai/ai-radar; contact via GitHub issues)";

const parser = new Parser({
  timeout: 30_000,
  headers: {
    "User-Agent": USER_AGENT,
    Accept:
      "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
  },
});

function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v == null) return null;
  // rss-parser sometimes emits Atom-style nested objects { name: ["..."], ... }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj.name)) return String(obj.name[0] ?? "").trim() || null;
    if (typeof obj.name === "string") return obj.name.trim() || null;
  }
  return null;
}

function normalizeItem(
  sourceId: string,
  item: Parser.Item & Record<string, unknown>
): NewArticle | null {
  const url = item.link?.trim();
  const title = item.title?.trim();
  if (!url || !title) return null;

  const canonical = canonicalizeUrl(url);
  const summary = item.contentSnippet ?? asString(item.summary);
  const content =
    asString(item["content:encoded"]) ?? asString(item.content) ?? summary ?? null;

  let publishedAt: Date | null = null;
  if (item.isoDate) {
    const d = new Date(item.isoDate);
    if (!isNaN(d.getTime())) publishedAt = d;
  } else if (item.pubDate) {
    const d = new Date(item.pubDate);
    if (!isNaN(d.getTime())) publishedAt = d;
  }

  return {
    sourceId,
    externalId: item.guid ?? asString(item.id),
    url,
    canonicalUrl: canonical,
    title,
    author: asString(item.creator) ?? asString(item.author),
    summaryRaw: summary,
    contentRaw: content,
    publishedAt,
    language: null,
    status: "new",
    hashUrl: urlHash(url),
    hashTitle: titleHash(title),
    hashContent: contentHash(content),
  };
}

export const rssAdapter: FetchAdapter = {
  type: "rss",
  async fetch(source: Source): Promise<FetchResult> {
    try {
      const feed = await parser.parseURL(source.url);
      const items = feed.items ?? [];
      const articles = items
        .map((item) => normalizeItem(source.id, item))
        .filter((a): a is NewArticle => a !== null);
      return { source, articles, fetchedCount: items.length };
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

// Legacy default export kept for backward compatibility with earlier scaffold.
export async function fetchSource(source: Source): Promise<FetchResult> {
  return rssAdapter.fetch(source);
}
