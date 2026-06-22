import type { NewArticle, Source } from "../db/schema";

export interface FetchResult {
  source: Source;
  articles: NewArticle[];
  fetchedCount: number;
  error?: string;
}

export interface FetchAdapter {
  /** Source.type value this adapter handles (e.g. "rss", "sitemap", "arxiv_api"). */
  readonly type: string;
  /** Fetch one source and return normalized articles. Must not throw — catch and return error in result. */
  fetch(source: Source): Promise<FetchResult>;
}
