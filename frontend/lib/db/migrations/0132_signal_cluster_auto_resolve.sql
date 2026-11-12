ALTER TABLE "signal_cluster_resolutions" ADD COLUMN "automatic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "signals" SET "metadata" = "metadata" - 'resolvingEnabled' WHERE "metadata" ? 'resolvingEnabled';
