ALTER TYPE "public"."trace_type" ADD VALUE 'PLAYGROUND';--> statement-breakpoint
ALTER TABLE "agent_chats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluation_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pipeline_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "spans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "traces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_invitations" DROP CONSTRAINT "workspace_invitations_workspace_id_email_key";--> statement-breakpoint
DROP INDEX "events_span_id_project_id_idx";--> statement-breakpoint
DROP INDEX "spans_project_id_trace_id_start_time_idx";--> statement-breakpoint
DROP INDEX "spans_root_project_id_start_time_end_time_trace_id_idx";--> statement-breakpoint
DROP INDEX "traces_id_project_id_start_time_times_not_null_idx";--> statement-breakpoint
DROP INDEX "traces_project_id_trace_type_start_time_end_time_idx";--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "session_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "playgrounds" ALTER COLUMN "tools" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "playgrounds" ALTER COLUMN "temperature" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "playgrounds" ALTER COLUMN "temperature" SET DEFAULT '1';--> statement-breakpoint
ALTER TABLE "traces" ALTER COLUMN "visibility" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "workspace_invitations" ALTER COLUMN "workspace_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "workspace_invitations" ALTER COLUMN "email" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "user_id" text;--> statement-breakpoint
CREATE INDEX "spans_partial_evaluator_trace_id_project_id_start_time_span_id_" ON "spans" USING btree ("trace_id" uuid_ops,"project_id" uuid_ops,"start_time" timestamptz_ops,"span_id" uuid_ops) WHERE (span_type = 'EVALUATOR'::span_type);--> statement-breakpoint
CREATE INDEX "spans_partial_executor_trace_id_project_id_start_time_span_id_i" ON "spans" USING btree ("trace_id" timestamptz_ops,"project_id" uuid_ops,"start_time" uuid_ops,"span_id" timestamptz_ops) WHERE (span_type = 'EXECUTOR'::span_type);--> statement-breakpoint
CREATE INDEX "spans_project_id_created_at_idx" ON "spans" USING btree ("project_id" timestamptz_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "spans_project_id_start_time_idx" ON "spans" USING btree ("project_id" uuid_ops,"start_time" uuid_ops);--> statement-breakpoint
CREATE INDEX "events_span_id_project_id_idx" ON "events" USING btree ("project_id" uuid_ops,"span_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "spans_project_id_trace_id_start_time_idx" ON "spans" USING btree ("project_id" timestamptz_ops,"trace_id" uuid_ops,"start_time" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "spans_root_project_id_start_time_end_time_trace_id_idx" ON "spans" USING btree ("project_id" timestamptz_ops,"start_time" timestamptz_ops,"end_time" uuid_ops,"trace_id" uuid_ops) WHERE (parent_span_id IS NULL);--> statement-breakpoint
CREATE INDEX "traces_id_project_id_start_time_times_not_null_idx" ON "traces" USING btree ("id" timestamptz_ops,"project_id" timestamptz_ops,"start_time" uuid_ops) WHERE ((start_time IS NOT NULL) AND (end_time IS NOT NULL));--> statement-breakpoint
CREATE INDEX "traces_project_id_trace_type_start_time_end_time_idx" ON "traces" USING btree ("project_id" timestamptz_ops,"start_time" timestamptz_ops,"end_time" timestamptz_ops) WHERE ((trace_type = 'DEFAULT'::trace_type) AND (start_time IS NOT NULL) AND (end_time IS NOT NULL));--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "agent_chats" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_user_id_accessible_for_api_key(api_key(), user_id));--> statement-breakpoint
CREATE POLICY "Enable insert for authenticated users only" ON "api_keys" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "evaluation_results" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_evaluation_id_accessible_for_api_key(api_key(), evaluation_id));--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "evaluations" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_evaluation_id_accessible_for_api_key(api_key(), id));--> statement-breakpoint
CREATE POLICY "all_actions_by_next_api_key" ON "pipeline_versions" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (is_pipeline_id_accessible_for_api_key(api_key(), pipeline_id));--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "spans" AS PERMISSIVE FOR SELECT TO public USING (is_project_id_accessible_for_api_key(api_key(), project_id));--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "traces" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_project_id_accessible_for_api_key(api_key(), project_id));--> statement-breakpoint
CREATE POLICY "Enable insert for authenticated users only" ON "users" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);