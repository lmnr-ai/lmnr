ALTER TYPE "public"."span_type" ADD VALUE 'HUMAN_EVALUATOR';--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "spans" DROP CONSTRAINT "unique_span_id_project_id";--> statement-breakpoint
DROP INDEX "span_path_idx";--> statement-breakpoint
DROP INDEX "spans_partial_evaluator_trace_id_project_id_start_time_span_id_";--> statement-breakpoint
DROP INDEX "spans_partial_executor_trace_id_project_id_start_time_span_id_i";--> statement-breakpoint
DROP INDEX "spans_project_id_created_at_idx";--> statement-breakpoint
DROP INDEX "spans_project_id_idx";--> statement-breakpoint
DROP INDEX "spans_project_id_trace_id_start_time_idx";--> statement-breakpoint
DROP INDEX "spans_root_project_id_start_time_end_time_trace_id_idx";--> statement-breakpoint
DROP INDEX "spans_start_time_end_time_idx";--> statement-breakpoint
DROP INDEX "spans_trace_id_idx";--> statement-breakpoint
DROP INDEX "trace_metadata_gin_idx";--> statement-breakpoint
DROP INDEX "traces_id_project_id_start_time_times_not_null_idx";--> statement-breakpoint
DROP INDEX "traces_start_time_end_time_idx";--> statement-breakpoint
ALTER TABLE "shared_payloads" ALTER COLUMN "payload_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "shared_payloads" ALTER COLUMN "project_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "label_classes" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "label_classes" ADD COLUMN "evaluator_runnable_graph" jsonb;--> statement-breakpoint
ALTER TABLE "label_classes" ADD COLUMN "pipeline_version_id" uuid;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "reasoning" text;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD COLUMN "prev_step_count" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD COLUMN "bytes_ingested" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD COLUMN "bytes_ingested_since_reset" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD COLUMN "prev_span_count" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "reset_time" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "spans_root_project_id_start_time_trace_id_idx" ON "spans" USING btree ("project_id" uuid_ops,"start_time" timestamptz_ops,"trace_id" uuid_ops) WHERE (parent_span_id IS NULL);--> statement-breakpoint
