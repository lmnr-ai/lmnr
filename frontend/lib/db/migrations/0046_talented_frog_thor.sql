ALTER TABLE "label_classes_for_path" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "label_classes_for_path" CASCADE;--> statement-breakpoint
ALTER TABLE "workspace_invitations" DROP CONSTRAINT "workspace_invitations_workspace_id_email_key";--> statement-breakpoint
ALTER TABLE "workspace_usage" DROP CONSTRAINT "user_usage_workspace_id_key";--> statement-breakpoint
ALTER TABLE "agent_chats" DROP CONSTRAINT "agent_chats_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "user_usage" DROP CONSTRAINT "user_usage_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "playgrounds" ALTER COLUMN "temperature" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "playgrounds" ALTER COLUMN "temperature" SET DEFAULT '1';--> statement-breakpoint
ALTER TABLE "agent_chats" ADD CONSTRAINT "agent_chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_usage" ADD CONSTRAINT "user_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "spans_name_idx" ON "spans" USING btree ("name" text_ops);--> statement-breakpoint
CREATE INDEX "traces_trace_type_idx" ON "traces" USING btree ("trace_type" enum_ops);--> statement-breakpoint
ALTER TABLE "label_classes" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "label_classes" DROP COLUMN "evaluator_runnable_graph";--> statement-breakpoint
ALTER TABLE "label_classes" DROP COLUMN "pipeline_version_id";--> statement-breakpoint
ALTER TABLE "labels" DROP COLUMN "reasoning";--> statement-breakpoint
ALTER TABLE "workspace_usage" DROP COLUMN "prev_span_count";--> statement-breakpoint
ALTER TABLE "workspace_usage" DROP COLUMN "prev_step_count";--> statement-breakpoint
ALTER TABLE "workspace_usage" DROP COLUMN "bytes_ingested";--> statement-breakpoint
ALTER TABLE "workspace_usage" DROP COLUMN "bytes_ingested_since_reset";--> statement-breakpoint
ALTER TABLE "workspace_usage" DROP COLUMN "prev_bytes_ingested";