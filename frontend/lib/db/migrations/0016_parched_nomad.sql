ALTER TABLE "dataset_datapoints" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "has_browser_session" boolean;