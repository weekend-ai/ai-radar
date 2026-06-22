/**
 * Content hydrator — for articles whose adapter didn't populate `contentRaw`
 * (currently: anything from the `sitemap` adapter, since we deliberately skip
 * the per-article HTTP during fetch).
 *
 * Pulls the article URL, extracts <title> + og:title + the first ~2000 chars
 * of <p> text from the HTML, and writes those into `articles.title` (if it's
 * still the slug-derived placeholder) + `articles.contentRaw`.
 *
 * Designed to be IDEMPOTENT: only touches articles with contentRaw IS NULL.
 * Safe to re-run.
 */

import { db } from "@/lib/db/client";
import { articles, sources, type Article } from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

const USER_AGENT =
  "ai-radar/0.1 (+https://github.com/weekend-ai/ai-radar; contact via GitHub issues)";

export interface HydrationResult {
  articleId: string;
  url: string;
  status: "hydrated" | "skipped" | "failed";
  error?: string;
  titleChanged?: boolean;
  contentChars?: number;
}

export interface HydrationSummary {
  attempted: number;
  hydrated: number;
  skipped: number;
  failed: number;
  results: HydrationResult[];
}

/**
 * Hydrate articles for sources whose adapter type is in `hydrateTypes`.
 * Default: hydrate sitemap-sourced articles (which have NULL contentRaw).
 */
export async function hydratePendingArticles(opts: {
  limit?: number;
  hydrateTypes?: string[];
  concurrency?: number;
} = {}): Promise<HydrationSummary> {
  const { limit = 200, hydrateTypes = ["sitemap"], concurrency = 4 } = opts;

  // Find candidate sources
  const candidateSources = await db
    .select({ id: sources.id })
    .from(sources)
    .where(inArray(sources.type, hydrateTypes));
  const sourceIds = candidateSources.map((s) => s.id);
  if (sourceIds.length === 0) {
    return { attempted: 0, hydrated: 0, skipped: 0, failed: 0, results: [] };
  }

  const pending = await db
    .select()
    .from(articles)
    .where(and(inArray(articles.sourceId, sourceIds), isNull(articles.contentRaw)))
    .limit(limit);

  const results: HydrationResult[] = [];
  // Simple manual concurrency queue (avoid p-limit dep).
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= pending.length) return;
      const a = pending[idx];
      results[idx] = await hydrateOne(a);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const hydrated = results.filter((r) => r.status === "hydrated").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;
  return { attempted: results.length, hydrated, skipped, failed, results };
}

async function hydrateOne(article: Article): Promise<HydrationResult> {
  try {
    const html = await fetchHtml(article.url);
    const { title, content } = extractFromHtml(html);

    if (!title && !content) {
      return {
        articleId: article.id,
        url: article.url,
        status: "skipped",
        error: "no title/content extracted",
      };
    }

    // Only overwrite title if (a) we got a real one AND (b) current title looks
    // like a slug-derived placeholder (all words start uppercase, no punctuation).
    const titleChanged = !!title && looksLikeSlugTitle(article.title) && title !== article.title;

    await db
      .update(articles)
      .set({
        ...(titleChanged ? { title } : {}),
        contentRaw: content,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, article.id));

    return {
      articleId: article.id,
      url: article.url,
      status: "hydrated",
      titleChanged,
      contentChars: content?.length ?? 0,
    };
  } catch (err) {
    return {
      articleId: article.id,
      url: article.url,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchHtml(url: string, timeoutMs = 20_000): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.5" },
      signal: ctl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Lightweight HTML extraction — regex-based, no cheerio dependency.
 * Targets the standard cases (og:title meta, <title>, <p> tags).
 */
export function extractFromHtml(html: string): { title: string | null; content: string | null } {
  // 1) og:title takes priority — it's usually the cleanest
  const ogTitle =
    matchAttrContent(html, /<meta[^>]+property=["']og:title["'][^>]*>/i) ??
    matchAttrContent(html, /<meta[^>]+name=["']twitter:title["'][^>]*>/i);

  // 2) Fallback to <title>
  const titleTag = (() => {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return null;
    return decodeEntities(stripTags(m[1])).trim();
  })();

  let title = ogTitle ?? titleTag;
  if (title) {
    // Strip common site-suffix patterns like " \ Anthropic" or " - OpenAI"
    title = title.replace(/\s+[\\|–\-—]\s+(Anthropic|OpenAI|Google|Hugging Face)\b.*$/i, "").trim();
    if (!title) title = null;
  }

  // 3) Content: og:description + first N <p> tags
  const ogDesc = matchAttrContent(html, /<meta[^>]+property=["']og:description["'][^>]*>/i);
  const metaDesc = matchAttrContent(html, /<meta[^>]+name=["']description["'][^>]*>/i);

  const paragraphs: string[] = [];
  const pRe = /<p[\s>][\s\S]*?<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(html)) && paragraphs.length < 30) {
    const text = decodeEntities(stripTags(m[0])).replace(/\s+/g, " ").trim();
    if (text.length > 40) paragraphs.push(text); // skip noise
  }

  const contentParts: string[] = [];
  if (ogDesc) contentParts.push(ogDesc);
  else if (metaDesc) contentParts.push(metaDesc);
  contentParts.push(...paragraphs);
  const content = contentParts.join("\n\n").slice(0, 4000).trim() || null;

  return { title, content };
}

function matchAttrContent(html: string, tagRe: RegExp): string | null {
  const m = html.match(tagRe);
  if (!m) return null;
  const c = m[0].match(/content=["']([^"']+)["']/i);
  return c ? decodeEntities(c[1]).trim() || null : null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

/** A slug-derived title looks like "3 5 Models And Computer Use" — every word
 *  starts with a capital, no real punctuation, no parentheses/colons. */
export function looksLikeSlugTitle(title: string): boolean {
  if (!title || title.length > 120) return false;
  if (/[:?!()"']/.test(title)) return false;
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return false;
  return words.every((w) => /^[A-Z0-9]/.test(w));
}
