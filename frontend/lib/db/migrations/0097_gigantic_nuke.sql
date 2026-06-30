ALTER TABLE "subscription_tiers" ADD COLUMN IF NOT EXISTS "signal_runs" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ADD COLUMN IF NOT EXISTS "extra_signal_run_price" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ADD COLUMN IF NOT EXISTS "signal_cost_included_micro_usd" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD COLUMN IF NOT EXISTS "signal_runs" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD COLUMN IF NOT EXISTS "signal_cost" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint

UPDATE "subscription_tiers" SET "signal_cost_included_micro_usd" = 5000000 WHERE lower("name") = 'free';--> statement-breakpoint
UPDATE "subscription_tiers" SET "signal_cost_included_micro_usd" = 15000000 WHERE lower("name") = 'hobby';--> statement-breakpoint
UPDATE "subscription_tiers" SET "signal_cost_included_micro_usd" = 50000000 WHERE lower("name") = 'pro'; --> statement-breakpoint
