import { rssAdapter } from "./adapters/rss";
import { sitemapAdapter } from "./adapters/sitemap";
import { arxivAdapter } from "./adapters/arxiv";
import type { Source } from "../db/schema";
import type { FetchAdapter, FetchResult } from "./types";

const adapters: Record<string, FetchAdapter> = {
  [rssAdapter.type]: rssAdapter,
  [sitemapAdapter.type]: sitemapAdapter,
  [arxivAdapter.type]: arxivAdapter,
};

/**
 * Dispatch a source to its adapter based on `source.type`.
 * Unknown types return an error result rather than throw.
 */
export async function fetchSource(source: Source): Promise<FetchResult> {
  const adapter = adapters[source.type];
  if (!adapter) {
    return {
      source,
      articles: [],
      fetchedCount: 0,
      error: `unknown source.type='${source.type}' — supported: ${Object.keys(adapters).join(", ")}`,
    };
  }
  return adapter.fetch(source);
}

export { adapters };
export type { FetchResult, FetchAdapter };
