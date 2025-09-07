ALTER TYPE "public"."span_type" ADD VALUE 'EVENT';--> statement-breakpoint
ALTER TYPE "public"."workspace_role" ADD VALUE 'admin';--> statement-breakpoint
CREATE TABLE "dataset_parquets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dataset_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"parquet_path" text NOT NULL,
	"job_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "traces_agent_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traces_agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"chat_id" uuid NOT NULL,
	"trace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traces_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trace_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"summary" text,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_chats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluation_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pipeline_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "spans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "traces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dashboard_charts" DROP CONSTRAINT "fk_dashboard_charts_project_id";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_span_id_project_id_fkey";
--> statement-breakpoint
DROP INDEX "events_span_id_project_id_idx";--> statement-breakpoint
DROP INDEX "spans_project_id_start_time_idx";--> statement-breakpoint
DROP INDEX "spans_root_project_id_start_time_trace_id_idx";--> statement-breakpoint
DROP INDEX "spans_trace_id_start_time_idx";--> statement-breakpoint
DROP INDEX "traces_project_id_trace_type_start_time_end_time_idx";--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "spans" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "spans" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "extra_span_price" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "extra_span_price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_parquets" ADD CONSTRAINT "dataset_parquets_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "traces_agent_chats" ADD CONSTRAINT "traces_agent_chats_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "traces_agent_messages" ADD CONSTRAINT "traces_agent_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "traces_summaries" ADD CONSTRAINT "traces_summaries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "traces_summaries" ADD CONSTRAINT "traces_summaries_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "dashboard_charts" ADD CONSTRAINT "dashboard_charts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_span_id_idx" ON "events" USING btree ("span_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "events_span_id_project_id_idx" ON "events" USING btree ("project_id" uuid_ops,"span_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "spans_project_id_start_time_idx" ON "spans" USING btree ("project_id" uuid_ops,"start_time" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "spans_root_project_id_start_time_trace_id_idx" ON "spans" USING btree ("project_id" uuid_ops,"start_time" uuid_ops,"trace_id" uuid_ops) WHERE (parent_span_id IS NULL);--> statement-breakpoint
CREATE INDEX "spans_trace_id_start_time_idx" ON "spans" USING btree ("trace_id" timestamptz_ops,"start_time" uuid_ops);--> statement-breakpoint
CREATE INDEX "traces_project_id_trace_type_start_time_end_time_idx" ON "traces" USING btree ("project_id" timestamptz_ops,"start_time" timestamptz_ops,"end_time" timestamptz_ops) WHERE ((trace_type = 'DEFAULT'::trace_type) AND (start_time IS NOT NULL) AND (end_time IS NOT NULL));--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "agent_chats" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_user_id_accessible_for_api_key(api_key(), user_id));--> statement-breakpoint
CREATE POLICY "Enable insert for authenticated users only" ON "api_keys" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "evaluation_results" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_evaluation_id_accessible_for_api_key(api_key(), evaluation_id));--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "evaluations" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_evaluation_id_accessible_for_api_key(api_key(), id));--> statement-breakpoint
CREATE POLICY "all_actions_by_next_api_key" ON "pipeline_versions" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (is_pipeline_id_accessible_for_api_key(api_key(), pipeline_id));--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "spans" AS PERMISSIVE FOR SELECT TO public USING (is_project_id_accessible_for_api_key(api_key(), project_id));--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "traces" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_project_id_accessible_for_api_key(api_key(), project_id));--> statement-breakpoint
CREATE POLICY "Enable insert for authenticated users only" ON "users" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);