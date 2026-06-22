import { XMLParser } from "fast-xml-parser";
import { canonicalizeUrl, contentHash, titleHash, urlHash } from "../dedup";
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
 * arXiv adapter — queries the official Atom export API.
 *
 * Endpoint:  https://export.arxiv.org/api/query
 * Docs:      https://info.arxiv.org/help/api/user-manual.html
 *
 * Source config conventions:
 *   - `url` is the FULL query URL including search_query, sortBy, max_results.
 *     Example:
 *       https://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=30
 *
 * We use the official API rather than the legacy /rss/ endpoint because the
 * latter returns Atom XML that rss-parser can't decode (no items observed in
 * production as of 2026-06).
 *
 * Rate limit: arXiv asks for ~1 request per 3 seconds. We add a 3s delay
 * BEFORE each fetch so concurrent ai-radar workers don't hammer them.
 */
export const arxivAdapter: FetchAdapter = {
  type: "arxiv_api",
  async fetch(source: Source): Promise<FetchResult> {
    try {
      // Be a good citizen — 3s pre-fetch delay per arXiv guidance.
      await new Promise((r) => setTimeout(r, 3000));

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

      const entries = parsed?.feed?.entry;
      if (!entries) {
        return { source, articles: [], fetchedCount: 0 };
      }
      const list: ArxivEntry[] = Array.isArray(entries) ? entries : [entries];

      const articles: NewArticle[] = list
        .map((e) => normalizeEntry(source.id, e))
        .filter((a): a is NewArticle => a !== null);

      return { source, articles, fetchedCount: list.length };
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

interface ArxivEntry {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  updated?: string;
  author?: { name?: string } | Array<{ name?: string }>;
  link?: Array<{ "@_href"?: string; "@_rel"?: string; "@_type"?: string }> | { "@_href"?: string };
  category?: Array<{ "@_term"?: string }> | { "@_term"?: string };
}

function normalizeEntry(sourceId: string, entry: ArxivEntry): NewArticle | null {
  const rawId = entry.id?.trim();
  const title = cleanText(entry.title);
  if (!rawId || !title) return null;

  // entry.id is the full URL incl. version (http://arxiv.org/abs/2402.03300v1)
  // We prefer the abstract page as the canonical link.
  const absUrl = rawId.replace(/^http:\/\//, "https://");
  const summary = cleanText(entry.summary);

  // Authors can be single object or array.
  let author: string | null = null;
  if (Array.isArray(entry.author)) {
    author = entry.author
      .map((a) => a?.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(", ");
  } else if (entry.author?.name) {
    author = entry.author.name;
  }
  if (author === "") author = null;

  let publishedAt: Date | null = null;
  if (entry.published) {
    const d = new Date(entry.published);
    if (!isNaN(d.getTime())) publishedAt = d;
  }

  return {
    sourceId,
    externalId: rawId,
    url: absUrl,
    canonicalUrl: canonicalizeUrl(absUrl),
    title,
    author,
    summaryRaw: summary,
    contentRaw: summary,
    publishedAt,
    language: "en",
    status: "new",
    hashUrl: urlHash(absUrl),
    hashTitle: titleHash(title),
    hashContent: contentHash(summary),
  };
}

function cleanText(s: unknown): string | null {
  if (typeof s !== "string") return null;
  // arXiv summaries are wrapped & have extra newlines — collapse whitespace.
  const cleaned = s.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/atom+xml, application/xml, */*",
      },
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}
