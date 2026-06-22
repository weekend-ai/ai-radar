ALTER TABLE "articles" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "embedded_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "articles_embedded_idx" ON "articles" USING btree ("embedded_at");