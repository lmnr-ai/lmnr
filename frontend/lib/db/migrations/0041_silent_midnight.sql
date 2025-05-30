ALTER TABLE "subscription_tiers" ADD COLUMN "bytes_ingested" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ADD COLUMN "extra_byte_price" double precision DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD COLUMN "spans_bytes_ingested" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD COLUMN "spans_bytes_ingested_since_reset" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD COLUMN "browser_session_events_bytes_ingested" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD COLUMN "browser_session_events_bytes_ingested_since_reset" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
