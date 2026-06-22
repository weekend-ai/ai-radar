import Parser from "rss-parser";
import { canonicalizeUrl, contentHash, titleHash, urlHash } from "./dedup";
import type { NewArticle, Source } from "../db/schema";

const parser = new Parser({
  timeout: 30_000,
  headers: {
    "User-Agent":
      "ai-radar/0.1 (+https://github.com/weekend-ai/ai-radar; contact via GitHub issues)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
  },
});

export interface FetchResult {
  source: Source;
  articles: NewArticle[];
  fetchedCount: number;
  error?: string;
}

/**
 * Fetch a single source's RSS/Atom feed and normalize items into NewArticle rows.
 * Dedup hashes are computed here; database-level uniqueness is enforced at insert.
 */
export async function fetchSource(source: Source): Promise<FetchResult> {
  try {
    const feed = await parser.parseURL(source.url);
    const items = feed.items ?? [];

    const articles: NewArticle[] = items
      .map((item) => normalizeItem(source.id, item))
      .filter((a): a is NewArticle => a !== null);

    return {
      source,
      articles,
      fetchedCount: items.length,
    };
  } catch (err) {
    return {
      source,
      articles: [],
      fetchedCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

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

function normalizeItem(sourceId: string, item: Parser.Item & Record<string, unknown>): NewArticle | null {
  const url = item.link?.trim();
  const title = item.title?.trim();
  if (!url || !title) return null;

  const canonical = canonicalizeUrl(url);
  const summary = item.contentSnippet ?? asString(item.summary);
  const content =
    asString(item["content:encoded"]) ??
    asString(item.content) ??
    summary ??
    null;

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
    language: null, // filled by enrichment later
    status: "new",
    hashUrl: urlHash(url),
    hashTitle: titleHash(title),
    hashContent: contentHash(content),
  };
}
