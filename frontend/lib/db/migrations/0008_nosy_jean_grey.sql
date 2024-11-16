ALTER TABLE "traces" DROP COLUMN IF EXISTS "version";--> statement-breakpoint
ALTER TABLE "traces" DROP COLUMN IF EXISTS "release";--> statement-breakpoint
ALTER TABLE "traces" DROP COLUMN IF EXISTS "user_id";--> statement-breakpoint
ALTER TABLE "traces" DROP COLUMN IF EXISTS "success";--> statement-breakpoint
ALTER TABLE "spans" DROP COLUMN IF EXISTS "version";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trace_metadata_gin_idx" ON "traces" USING gin ("metadata");
