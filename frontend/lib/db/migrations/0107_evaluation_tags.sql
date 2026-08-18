ALTER TABLE "evaluations" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluations_tags_gin_idx" ON "evaluations" USING gin ("tags");
