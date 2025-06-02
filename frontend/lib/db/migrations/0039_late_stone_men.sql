ALTER TYPE "public"."trace_type" ADD VALUE 'PLAYGROUND';--> statement-breakpoint
ALTER TABLE "playgrounds" ALTER COLUMN "tools" SET DEFAULT '{}'::jsonb;--> statement-breakpoint