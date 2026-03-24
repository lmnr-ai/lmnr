ALTER TABLE "subscription_tiers" ALTER COLUMN "signal_runs" SET DEFAULT 0;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_usage" (
    "workspace_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "bytes" bigint NOT NULL DEFAULT 0,
    "signal_runs" bigint NOT NULL DEFAULT 0,
    "last_reported_date" timestamp with time zone not null DEFAULT date_trunc('day'::text, now())
);-->statement-breakpoint

ALTER TABLE "workspace_usage" ADD CONSTRAINT workspace_usage_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
