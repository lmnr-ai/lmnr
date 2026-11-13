ALTER TABLE "workspaces" ALTER COLUMN "signal_credit_remaining_micro_usd" DROP DEFAULT;--> statement-breakpoint
-- The one-time $5 Signals credit is retired: clear every balance so no further run is credited.
UPDATE "workspaces" SET "signal_credit_remaining_micro_usd" = NULL WHERE "signal_credit_remaining_micro_usd" IS NOT NULL;--> statement-breakpoint
-- Scale (internal "pro"): 100 GB data and $50 of Signals usage included every billing period.
UPDATE "subscription_tiers" SET "bytes_ingested" = 107374182400, "signal_cost_included_micro_usd" = 50000000 WHERE lower("name") = 'pro';--> statement-breakpoint
-- Existing Scale workspaces: move the included-data warning from 10 GiB to 100 GiB and add the
-- Signals-allowance warning that new Scale subscriptions get from the Stripe webhook.
UPDATE "workspace_usage_warnings" AS w SET "limit_value" = 107374182400, "last_notified_at" = NULL
FROM "workspaces" ws JOIN "subscription_tiers" t ON t."id" = ws."tier_id"
WHERE w."workspace_id" = ws."id" AND lower(t."name") = 'pro' AND w."usage_item" = 'bytes' AND w."limit_value" = 10737418240
  AND NOT EXISTS (SELECT 1 FROM "workspace_usage_warnings" x WHERE x."workspace_id" = w."workspace_id" AND x."usage_item" = 'bytes' AND x."limit_value" = 107374182400);--> statement-breakpoint
INSERT INTO "workspace_usage_warnings" ("workspace_id", "usage_item", "limit_value")
SELECT ws."id", 'signal_cost', 50000000
FROM "workspaces" ws JOIN "subscription_tiers" t ON t."id" = ws."tier_id"
WHERE lower(t."name") = 'pro'
ON CONFLICT DO NOTHING;
