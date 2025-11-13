ALTER TABLE "event_definitions" DROP CONSTRAINT "event_definitions_project_id_fkey";
--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD COLUMN "is_ingest_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
