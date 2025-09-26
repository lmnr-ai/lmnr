DROP TABLE IF EXISTS "agent_chats" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_messages" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_sessions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "machines" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "user_cookies" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "user_subscription_tiers" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "user_usage" CASCADE;--> statement-breakpoint
ALTER TABLE "tag_classes" DROP CONSTRAINT IF EXISTS "tag_classes_name_project_id_unique";--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_span_id_class_id_unique";--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_span_id_class_id_user_id_unique";--> statement-breakpoint
ALTER TABLE "tag_classes" DROP CONSTRAINT IF EXISTS "tag_classes_project_id_fkey";
--> statement-breakpoint
DROP INDEX IF EXISTS "tag_classes_project_id_id_key";--> statement-breakpoint
DROP INDEX IF EXISTS "tags_span_id_class_id_user_id_key";--> statement-breakpoint
DROP INDEX IF EXISTS "events_span_id_project_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "spans_root_project_id_start_time_trace_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "traces_project_id_trace_type_start_time_end_time_idx";--> statement-breakpoint
ALTER TABLE "shared_traces" ALTER COLUMN "project_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tag_classes" ADD CONSTRAINT "tag_classes_pkey" PRIMARY KEY("name","project_id");--> statement-breakpoint
ALTER TABLE "tag_classes" DROP CONSTRAINT IF EXISTS "label_classes_project_id_fkey";--> statement-breakpoint
ALTER TABLE "tag_classes" ADD CONSTRAINT "tag_classes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "tag_classes" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "tag_classes" DROP COLUMN "evaluator_runnable_graph";--> statement-breakpoint
ALTER TABLE "tag_classes" DROP COLUMN "pipeline_version_id";--> statement-breakpoint
ALTER TABLE "tags" DROP COLUMN "class_id";--> statement-breakpoint
