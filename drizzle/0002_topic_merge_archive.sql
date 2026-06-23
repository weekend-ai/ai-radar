ALTER TABLE "topics" ADD COLUMN "merged_into_id" uuid;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "notes" text;--> statement-breakpoint
CREATE INDEX "topics_merged_into_idx" ON "topics" USING btree ("merged_into_id");