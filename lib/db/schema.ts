import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uuid,
  primaryKey,
  numeric,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Custom pgvector column type. drizzle-kit doesn't natively support `vector`
// in older versions, so we declare it with customType and write the column
// SQL ourselves. Cast input/output as number[] for app code.
const vector = customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns e.g. "[0.1,0.2,...]"
    return JSON.parse(value) as number[];
  },
});

// ============================================================
// sources — RSS / Web feeds we pull from
// ============================================================
export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(), // human-readable slug, e.g. "openai-blog"
    name: text("name").notNull(),
    url: text("url").notNull(),
    type: text("type").notNull().default("rss"), // rss | atom | json | html (later)
    category: text("category"), // models | infra | agents | research | community | media
    tier: integer("tier").notNull().default(2), // 1 = official, 2 = industry, 3 = community, 4 = research
    enabled: boolean("enabled").notNull().default(true),
    priority: text("priority").notNull().default("medium"), // high | medium | low
    weight: integer("weight").notNull().default(10), // source_weight for scoring
    description: text("description"),
    tags: jsonb("tags").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    refreshIntervalMinutes: integer("refresh_interval_minutes").notNull().default(120),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    articleCount: integer("article_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    enabledIdx: index("sources_enabled_idx").on(t.enabled),
    tierIdx: index("sources_tier_idx").on(t.tier),
  })
);

// ============================================================
// articles — one row per fetched item, dedup via hash columns
// ============================================================
export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalId: text("external_id"), // guid from feed
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url"),
    title: text("title").notNull(),
    author: text("author"),
    summaryRaw: text("summary_raw"),
    contentRaw: text("content_raw"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    language: text("language"),
    status: text("status").notNull().default("new"), // new | enriched | clustered | dismissed | failed
    hashUrl: text("hash_url").notNull(),
    hashTitle: text("hash_title").notNull(),
    hashContent: text("hash_content"),
    embedding: vector("embedding", { dimensions: 1536 }),
    embeddedAt: timestamp("embedded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceIdx: index("articles_source_idx").on(t.sourceId),
    statusIdx: index("articles_status_idx").on(t.status),
    publishedIdx: index("articles_published_idx").on(t.publishedAt),
    fetchedIdx: index("articles_fetched_idx").on(t.fetchedAt),
    hashUrlIdx: index("articles_hash_url_idx").on(t.hashUrl),
    hashTitleIdx: index("articles_hash_title_idx").on(t.hashTitle),
    embeddedIdx: index("articles_embedded_idx").on(t.embeddedAt),
  })
);

// ============================================================
// article_insights — LLM-generated structured analysis (Day 5+)
// ============================================================
export const articleInsights = pgTable("article_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" })
    .unique(),
  oneSentenceSummary: text("one_sentence_summary"),
  summaryEn: text("summary_en"),
  summaryZh: text("summary_zh"),
  keyPoints: jsonb("key_points").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
  entities: jsonb("entities").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
  eventType: text("event_type"), // product_update | research | funding | model_release | analysis | tool | other
  predictedCategory: text("predicted_category"),
  predictedTags: jsonb("predicted_tags").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
  whyItMattersEn: text("why_it_matters_en"),
  whyItMattersZh: text("why_it_matters_zh"),
  newsletterAngleEn: text("newsletter_angle_en"),
  newsletterAngleZh: text("newsletter_angle_zh"),
  importanceScore: integer("importance_score"), // 1-10, LLM rated
  noveltyScore: integer("novelty_score"), // 1-10, computed (recency + dedup signal)
  engineeringRelevanceScore: integer("engineering_relevance_score"), // 1-10, rule-based (category, source)
  audienceFitScore: integer("audience_fit_score"), // 1-10, rule-based
  finalScore: integer("final_score"), // composite
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  model: text("model"), // which LLM produced this
  promptVersion: text("prompt_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// topics — clustered events across multiple articles (Day 6+)
// ============================================================
export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titleEn: text("title_en"),
    titleZh: text("title_zh"),
    slug: text("slug").unique(),
    summaryEn: text("summary_en"),
    summaryZh: text("summary_zh"),
    status: text("status").notNull().default("open"), // open | selected | drafted | published | dismissed | archived | merged
    importanceScore: integer("importance_score"),
    noveltyScore: integer("novelty_score"),
    audienceFitScore: integer("audience_fit_score"),
    finalScore: integer("final_score"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    articleCount: integer("article_count").notNull().default(0),
    primaryArticleId: uuid("primary_article_id"),
    // Day 9.5: merge/archive support. mergedIntoId points to the survivor of
    // a merge; if set, this topic should be hidden from /topics. notes is a
    // free-form scratchpad an operator can write on the detail page.
    mergedIntoId: uuid("merged_into_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("topics_status_idx").on(t.status),
    finalScoreIdx: index("topics_final_score_idx").on(t.finalScore),
    mergedIntoIdx: index("topics_merged_into_idx").on(t.mergedIntoId),
  })
);

export const topicArticles = pgTable(
  "topic_articles",
  {
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull().default("supporting"), // primary | supporting | analysis | discussion | duplicate
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.topicId, t.articleId] }),
  })
);

// ============================================================
// newsletter_issues — draft / published newsletter editions
// ============================================================
export const newsletterIssues = pgTable("newsletter_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  titleEn: text("title_en"),
  titleZh: text("title_zh"),
  subjectEn: text("subject_en"),
  subjectZh: text("subject_zh"),
  status: text("status").notNull().default("draft"), // draft | published
  language: text("language").notNull().default("en"),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  bodyMarkdown: text("body_markdown"),
  bodyHtml: text("body_html"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

export const newsletterIssueItems = pgTable(
  "newsletter_issue_items",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => newsletterIssues.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    articleId: uuid("article_id").references(() => articles.id, { onDelete: "set null" }),
    section: text("section").notNull(), // top_stories | infra_watch | research | quick_hits | ...
    orderIndex: integer("order_index").notNull().default(0),
    editorNote: text("editor_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    issueIdx: index("nl_items_issue_idx").on(t.issueId),
  })
);

// ============================================================
// fetch_jobs — audit log of fetch attempts
// ============================================================
export const fetchJobs = pgTable(
  "fetch_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // pending | running | success | error
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    articleCount: integer("article_count").notNull().default(0),
    newArticleCount: integer("new_article_count").notNull().default(0),
    error: text("error"),
    triggeredBy: text("triggered_by").notNull().default("scheduler"), // scheduler | manual
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceIdx: index("fetch_jobs_source_idx").on(t.sourceId),
    createdIdx: index("fetch_jobs_created_idx").on(t.createdAt),
  })
);

// ============================================================
// Type exports
// ============================================================
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type ArticleInsight = typeof articleInsights.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type NewsletterIssue = typeof newsletterIssues.$inferSelect;
export type FetchJob = typeof fetchJobs.$inferSelect;
