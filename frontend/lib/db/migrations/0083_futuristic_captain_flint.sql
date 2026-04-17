ALTER TABLE "subscription_tiers" RENAME COLUMN "signal_runs" TO "signal_steps_processed";--> statement-breakpoint
ALTER TABLE "subscription_tiers" RENAME COLUMN "extra_signal_run_price" TO "extra_signal_step_price";--> statement-breakpoint
ALTER TABLE "workspace_usage" RENAME COLUMN "signal_runs" TO "signal_steps";--> statement-breakpoint
