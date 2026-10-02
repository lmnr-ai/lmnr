-- Existing workspaces receive no retroactive credit. Change the remaining-credit
-- default only after PostgreSQL has materialized zero for the existing rows.
ALTER TABLE "workspaces" ADD COLUMN "signal_credit_remaining_micro_usd" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "signal_credit_remaining_micro_usd" SET DEFAULT 5000000;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "signal_credit_applied_micro_usd" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_signal_credit_remaining_check" CHECK ("workspaces"."signal_credit_remaining_micro_usd" >= 0 AND "workspaces"."signal_credit_remaining_micro_usd" <= 5000000);--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_signal_credit_applied_check" CHECK ("workspaces"."signal_credit_applied_micro_usd" >= 0 AND "workspaces"."signal_credit_applied_micro_usd" <= 5000000);--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_signal_credit_total_check" CHECK ("workspaces"."signal_credit_remaining_micro_usd" + "workspaces"."signal_credit_applied_micro_usd" <= 5000000);--> statement-breakpoint

-- The sign-up credit replaces the old recurring per-tier Signals allowance.
-- Remove each tier's system-managed warning before zeroing that allowance.
DELETE FROM "workspace_usage_warnings" AS warning
USING "workspaces" AS workspace, "subscription_tiers" AS tier
WHERE warning."workspace_id" = workspace."id"
  AND workspace."tier_id" = tier."id"
  AND warning."usage_item" = 'signal_cost'
  AND tier."signal_cost_included_micro_usd" > 0
  AND warning."limit_value" = tier."signal_cost_included_micro_usd";--> statement-breakpoint
UPDATE "subscription_tiers"
SET "signal_cost_included_micro_usd" = 0
WHERE lower("name") IN ('free', 'hobby', 'starter', 'pro');