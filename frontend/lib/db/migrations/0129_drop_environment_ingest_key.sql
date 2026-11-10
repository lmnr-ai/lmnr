-- Agent sandboxes now get a short-lived key per sandbox; the environment's ingest-only keys are unused.
DELETE FROM "project_api_keys" WHERE "id" IN (SELECT "ingest_api_key_id" FROM "project_environments");
--> statement-breakpoint
ALTER TABLE "project_environments" DROP CONSTRAINT "project_environments_ingest_api_key_id_fkey";
--> statement-breakpoint
ALTER TABLE "project_environments" DROP COLUMN "ingest_api_key_id";--> statement-breakpoint
ALTER TABLE "project_environments" DROP COLUMN "ingest_api_key";
