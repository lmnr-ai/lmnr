ALTER TABLE "signal_cluster_resolutions" ADD COLUMN "resolved_automatically" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "signal_cluster_resolutions" ADD COLUMN "reopened_automatically" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "signals" SET "metadata" = "metadata" - 'resolvingEnabled' WHERE "metadata" ? 'resolvingEnabled';
