ALTER TABLE "workspace_usage" ADD COLUMN "bytes_ingested" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD COLUMN "bytes_ingested_since_reset" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD COLUMN "prev_bytes_ingested" bigint DEFAULT '0' NOT NULL;