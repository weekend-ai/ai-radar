CREATE TABLE "article_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"one_sentence_summary" text,
	"summary_en" text,
	"summary_zh" text,
	"key_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"event_type" text,
	"predicted_category" text,
	"predicted_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"why_it_matters_en" text,
	"why_it_matters_zh" text,
	"newsletter_angle_en" text,
	"newsletter_angle_zh" text,
	"importance_score" integer,
	"novelty_score" integer,
	"engineering_relevance_score" integer,
	"audience_fit_score" integer,
	"final_score" integer,
	"confidence" numeric(4, 3),
	"model" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_insights_article_id_unique" UNIQUE("article_id")
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text,
	"url" text NOT NULL,
	"canonical_url" text,
	"title" text NOT NULL,
	"author" text,
	"summary_raw" text,
	"content_raw" text,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"language" text,
	"status" text DEFAULT 'new' NOT NULL,
	"hash_url" text NOT NULL,
	"hash_title" text NOT NULL,
	"hash_content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fetch_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"article_count" integer DEFAULT 0 NOT NULL,
	"new_article_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"triggered_by" text DEFAULT 'scheduler' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_issue_items" (
	"issue_id" uuid NOT NULL,
	"topic_id" uuid,
	"article_id" uuid,
	"section" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"editor_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_en" text,
	"title_zh" text,
	"subject_en" text,
	"subject_zh" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"body_markdown" text,
	"body_html" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"type" text DEFAULT 'rss' NOT NULL,
	"category" text,
	"tier" integer DEFAULT 2 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"weight" integer DEFAULT 10 NOT NULL,
	"description" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"refresh_interval_minutes" integer DEFAULT 120 NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"article_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_articles" (
	"topic_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"relation_type" text DEFAULT 'supporting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_articles_topic_id_article_id_pk" PRIMARY KEY("topic_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_en" text,
	"title_zh" text,
	"slug" text,
	"summary_en" text,
	"summary_zh" text,
	"status" text DEFAULT 'open' NOT NULL,
	"importance_score" integer,
	"novelty_score" integer,
	"audience_fit_score" integer,
	"final_score" integer,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"article_count" integer DEFAULT 0 NOT NULL,
	"primary_article_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "article_insights" ADD CONSTRAINT "article_insights_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fetch_jobs" ADD CONSTRAINT "fetch_jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_issue_items" ADD CONSTRAINT "newsletter_issue_items_issue_id_newsletter_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."newsletter_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_issue_items" ADD CONSTRAINT "newsletter_issue_items_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_issue_items" ADD CONSTRAINT "newsletter_issue_items_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_articles" ADD CONSTRAINT "topic_articles_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_articles" ADD CONSTRAINT "topic_articles_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_source_idx" ON "articles" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "articles_status_idx" ON "articles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "articles_published_idx" ON "articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "articles_fetched_idx" ON "articles" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "articles_hash_url_idx" ON "articles" USING btree ("hash_url");--> statement-breakpoint
CREATE INDEX "articles_hash_title_idx" ON "articles" USING btree ("hash_title");--> statement-breakpoint
CREATE INDEX "fetch_jobs_source_idx" ON "fetch_jobs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "fetch_jobs_created_idx" ON "fetch_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "nl_items_issue_idx" ON "newsletter_issue_items" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "sources_enabled_idx" ON "sources" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "sources_tier_idx" ON "sources" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "topics_status_idx" ON "topics" USING btree ("status");--> statement-breakpoint
CREATE INDEX "topics_final_score_idx" ON "topics" USING btree ("final_score");