UPDATE "subscription_tiers"
SET "signal_cost_included_micro_usd" = 2500000
WHERE lower("name") = 'free';
--> statement-breakpoint
UPDATE "subscription_tiers"
SET "signal_cost_included_micro_usd" = 7500000
WHERE lower("name") IN ('hobby', 'starter');
--> statement-breakpoint
UPDATE "subscription_tiers"
SET "signal_cost_included_micro_usd" = 25000000
WHERE lower("name") = 'pro';
