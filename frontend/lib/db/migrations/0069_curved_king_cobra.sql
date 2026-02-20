ALTER TABLE "subscription_tiers" ALTER COLUMN "stripe_product_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "stripe_product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ADD COLUMN "signal_runs" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ADD COLUMN "extra_signal_run_price" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_tiers" DROP COLUMN "storage_mib";--> statement-breakpoint
ALTER TABLE "subscription_tiers" DROP COLUMN "members_per_workspace";--> statement-breakpoint
ALTER TABLE "subscription_tiers" DROP COLUMN "steps";--> statement-breakpoint
ALTER TABLE "subscription_tiers" DROP COLUMN "extra_step_price";--> statement-breakpoint
ALTER TABLE "subscription_tiers" DROP COLUMN "spans";--> statement-breakpoint
ALTER TABLE "subscription_tiers" DROP COLUMN "extra_span_price";--> statement-breakpoint
