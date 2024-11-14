ALTER TABLE "workspace_usage" DROP CONSTRAINT "user_usage_workspace_id_key";--> statement-breakpoint
ALTER TABLE "evaluation_results" DROP COLUMN IF EXISTS "scores";--> statement-breakpoint
ALTER TABLE "evaluations" DROP COLUMN IF EXISTS "metadata";--> statement-breakpoint
ALTER TABLE "labels" DROP COLUMN IF EXISTS "job_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."label_job_status";