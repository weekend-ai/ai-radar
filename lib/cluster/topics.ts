/**
 * Topic clustering — connected-components on cosine similarity graph.
 *
 * Algorithm:
 *   1. Pull all article embeddings within `windowDays`.
 *   2. For each article, find top-K nearest neighbours with cosine sim > threshold.
 *   3. Build an undirected graph (article ↔ neighbour).
 *   4. Compute connected components via Union-Find.
 *   5. Each component with size >= minSize becomes a topic.
 *   6. Pick the highest-importance article as the topic's primary article.
 *   7. Aggregate scores: max(importance) + log(size) bonus.
 *
 * Why not k-means / DBSCAN?
 *   - k-means needs a fixed K, which is wrong for news (varies by day).
 *   - DBSCAN works but pgvector + hand-rolled Union-Find is dependency-free.
 *   - Connected-components matches "transitive similarity": A~B~C all in same
 *     topic even if A and C aren't directly similar. That's what we want.
 *
 * The actual similarity search is offloaded to pgvector using its cosine
 * distance operator (<=>). We only do the graph traversal in TypeScript.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  articles,
  articleInsights,
  topics,
  topicArticles,
} from "@/lib/db/schema";

// Tunables
export const DEFAULT_SIMILARITY_THRESHOLD = 0.82; // cosine similarity
// Empirically: 0.78 over-clusters near-version releases (Opus 4.7 + 4.8),
// 0.82 tightens to true same-event coverage.
export const DEFAULT_TOP_K = 6;
export const DEFAULT_MIN_TOPIC_SIZE = 2;
export const DEFAULT_WINDOW_DAYS = 60;

export interface ClusterSummary {
  candidateArticles: number;
  edgesFound: number;
  topicsCreated: number;
  topicsReused: number;
  articleAssignments: number;
  largestTopic: number;
}

interface ArticleRow {
  id: string;
  title: string;
  publishedAt: Date | null;
  importance: number | null;
}

interface EdgeRow {
  [key: string]: unknown;
  src_id: string;
  neighbour_id: string;
  sim: number;
}

/**
 * Union-Find / Disjoint Set
 */
class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  add(x: string) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) throw new Error(`element ${x} not in UnionFind`);
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root); // path compression
    return root;
  }

  union(a: string, b: string) {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rank = this.rank;
    if ((rank.get(ra) ?? 0) < (rank.get(rb) ?? 0)) {
      this.parent.set(ra, rb);
    } else if ((rank.get(ra) ?? 0) > (rank.get(rb) ?? 0)) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      rank.set(ra, (rank.get(ra) ?? 0) + 1);
    }
  }

  components(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const x of Array.from(this.parent.keys())) {
      const r = this.find(x);
      if (!out.has(r)) out.set(r, []);
      out.get(r)!.push(x);
    }
    return out;
  }
}

export function clusterEdges(
  nodeIds: string[],
  edges: Array<{ a: string; b: string }>
): Map<string, string[]> {
  const uf = new UnionFind();
  for (const id of nodeIds) uf.add(id);
  for (const e of edges) uf.union(e.a, e.b);
  return uf.components();
}

/**
 * Cluster recent articles into topics, persist results to topics + topic_articles.
 *
 * Wipes existing OPEN topics first so each run is fresh — published / selected
 * topics are preserved (status != 'open').
 */
export async function runClustering(opts: {
  threshold?: number;
  topK?: number;
  minTopicSize?: number;
  windowDays?: number;
} = {}): Promise<ClusterSummary> {
  const threshold = opts.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const minSize = opts.minTopicSize ?? DEFAULT_MIN_TOPIC_SIZE;
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;

  // 1) Pull candidate articles (those with embeddings in the window)
  const candidateRows = await db.execute<{
    id: string;
    title: string;
    published_at: Date | null;
    importance_score: number | null;
  }>(sql`
    SELECT
      a.id,
      a.title,
      a.published_at,
      i.importance_score
    FROM articles a
    LEFT JOIN article_insights i ON i.article_id = a.id
    WHERE a.embedding IS NOT NULL
      AND (a.published_at IS NULL OR a.published_at > NOW() - (${windowDays} || ' days')::interval)
    ORDER BY a.published_at DESC NULLS LAST
  `);
  const candidates: ArticleRow[] = (Array.isArray(candidateRows) ? candidateRows : (candidateRows as { rows: typeof candidateRows }).rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    publishedAt: r.published_at ? new Date(r.published_at) : null,
    importance: r.importance_score,
  }));

  if (candidates.length < minSize) {
    return {
      candidateArticles: candidates.length,
      edgesFound: 0,
      topicsCreated: 0,
      topicsReused: 0,
      articleAssignments: 0,
      largestTopic: 0,
    };
  }

  const candidateIds = candidates.map((c) => c.id);

  // 2) For each candidate, find top-K nearest neighbours (same set, cosine).
  //    cosine similarity = 1 - cosine distance; pgvector's <=> is cosine
  //    distance. We exclude self-matches and apply the threshold in SQL.
  //
  //    We use a LATERAL subquery to find K NN per candidate. This is one
  //    round-trip; pgvector with no index will scan but that's OK for ~2k rows.
  //
  //    Note: we pull ALL candidates with embeddings; the windowDays filter
  //    was already applied above, so just match the same WHERE here.
  const edgeRows = await db.execute<EdgeRow>(sql`
    WITH cand AS (
      SELECT a.id, a.embedding
      FROM articles a
      WHERE a.embedding IS NOT NULL
        AND (a.published_at IS NULL OR a.published_at > NOW() - (${windowDays} || ' days')::interval)
    )
    SELECT
      c1.id AS src_id,
      nn.id AS neighbour_id,
      (1 - (c1.embedding <=> nn.embedding))::float8 AS sim
    FROM cand c1
    CROSS JOIN LATERAL (
      SELECT c2.id, c2.embedding
      FROM cand c2
      WHERE c2.id <> c1.id
      ORDER BY c1.embedding <=> c2.embedding ASC
      LIMIT ${topK}
    ) nn
    WHERE (1 - (c1.embedding <=> nn.embedding)) >= ${threshold}
  `);

  const edges = (Array.isArray(edgeRows) ? edgeRows : (edgeRows as { rows: typeof edgeRows }).rows ?? []) as EdgeRow[];

  // 3+4) Union-Find over edges
  const components = clusterEdges(
    candidateIds,
    edges.map((e) => ({ a: e.src_id, b: e.neighbour_id }))
  );

  // 5) Filter components by minSize
  const topicComponents = Array.from(components.values()).filter(
    (members) => members.length >= minSize
  );

  // 6+7) Persist. Wipe existing OPEN topics first.
  await db.execute(sql`
    DELETE FROM topic_articles
    WHERE topic_id IN (SELECT id FROM topics WHERE status = 'open')
  `);
  await db.execute(sql`DELETE FROM topics WHERE status = 'open'`);

  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  let topicsCreated = 0;
  let assignments = 0;
  let largest = 0;

  for (const members of topicComponents) {
    // Pick primary article: highest importance, then most recent
    const sorted = [...members]
      .map((id) => candidateById.get(id)!)
      .sort((a, b) => {
        const ai = a.importance ?? 0;
        const bi = b.importance ?? 0;
        if (ai !== bi) return bi - ai;
        const at = a.publishedAt?.getTime() ?? 0;
        const bt = b.publishedAt?.getTime() ?? 0;
        return bt - at;
      });
    const primary = sorted[0];
    const maxImportance = sorted[0].importance ?? 1;
    // Composite: max importance + log2(size) bonus to surface clusters with many sources
    const finalScore = Math.min(
      10,
      Math.round((maxImportance ?? 0) + Math.log2(members.length))
    );

    const firstSeen = members
      .map((id) => candidateById.get(id)?.publishedAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const lastSeen = members
      .map((id) => candidateById.get(id)?.publishedAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const inserted = await db
      .insert(topics)
      .values({
        titleEn: primary.title.slice(0, 200),
        slug: null,
        status: "open",
        importanceScore: maxImportance,
        finalScore,
        firstSeenAt: firstSeen,
        lastSeenAt: lastSeen,
        articleCount: members.length,
        primaryArticleId: primary.id,
      })
      .returning({ id: topics.id });
    const topicId = inserted[0].id;
    topicsCreated += 1;
    largest = Math.max(largest, members.length);

    // Insert topic_articles rows
    const tArows = members.map((memberId) => ({
      topicId,
      articleId: memberId,
      relationType: memberId === primary.id ? "primary" : "supporting",
    }));
    if (tArows.length > 0) {
      await db.insert(topicArticles).values(tArows);
      assignments += tArows.length;
    }
  }

  return {
    candidateArticles: candidates.length,
    edgesFound: edges.length,
    topicsCreated,
    topicsReused: 0,
    articleAssignments: assignments,
    largestTopic: largest,
  };
}
