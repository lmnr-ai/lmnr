ALTER TABLE "signal_cluster_resolutions" ADD COLUMN IF NOT EXISTS "resolved_automatically" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "signal_cluster_resolutions" ADD COLUMN IF NOT EXISTS "reopened_automatically" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "signals" SET "metadata" = "metadata" - 'resolvingEnabled' WHERE "metadata" ? 'resolvingEnabled';
