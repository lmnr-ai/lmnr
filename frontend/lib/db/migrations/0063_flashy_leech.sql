DROP TABLE "dataset_datapoints" CASCADE;--> statement-breakpoint
DROP TABLE "evaluation_scores" CASCADE;--> statement-breakpoint
DROP TABLE "spans" CASCADE;--> statement-breakpoint
DROP TABLE "summary_trigger_spans" CASCADE;--> statement-breakpoint
DROP TABLE "tags" CASCADE;--> statement-breakpoint
DROP TABLE "traces_summaries" CASCADE;--> statement-breakpoint
DROP TABLE "user_subscription_tiers" CASCADE;--> statement-breakpoint
DROP TABLE "user_usage" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_usage" CASCADE;--> statement-breakpoint
ALTER TABLE "evaluation_results" ALTER COLUMN "data" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
