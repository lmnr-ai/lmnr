ALTER TABLE "signals" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "signals" SET "metadata" = jsonb_build_object('sampleRate', "sample_rate") WHERE "sample_rate" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" DROP COLUMN "sample_rate";
