ALTER TABLE "workspaces" ADD COLUMN "signal_credit_remaining_micro_usd" bigint;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "signal_credit_remaining_micro_usd" SET DEFAULT 5000000;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_signal_credit_remaining_check" CHECK ("workspaces"."signal_credit_remaining_micro_usd" IS NULL OR ("workspaces"."signal_credit_remaining_micro_usd" >= 0 AND "workspaces"."signal_credit_remaining_micro_usd" <= 5000000));--> statement-breakpoint
DELETE FROM "workspace_usage_warnings" WHERE "usage_item" IN ('signal_cost', 'signal_credit');--> statement-breakpoint
UPDATE "subscription_tiers" SET "signal_cost_included_micro_usd" = 0 WHERE LOWER("name") IN ('free', 'hobby', 'starter', 'pro');