CREATE TABLE IF NOT EXISTS "playgrounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluation_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pipeline_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "traces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX IF EXISTS "spans_parent_span_id_project_id_start_time_end_time_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "spans_project_id_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "playgrounds" ADD CONSTRAINT "playgrounds_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_root_project_id_start_time_end_time_trace_id_idx" ON "spans" USING btree ("project_id","start_time","end_time","trace_id") WHERE (parent_span_id IS NULL);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traces_project_id_trace_type_start_time_end_time_idx" ON "traces" USING btree ("project_id","start_time","end_time") WHERE ((trace_type = 'DEFAULT'::trace_type) AND (start_time IS NOT NULL) AND (end_time IS NOT NULL));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_project_id_idx" ON "spans" USING hash ("project_id");--> statement-breakpoint
CREATE POLICY "Enable insert for authenticated users only" ON "api_keys" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "evaluation_results" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_evaluation_id_accessible_for_api_key(api_key(), evaluation_id));--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "evaluations" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_evaluation_id_accessible_for_api_key(api_key(), id));--> statement-breakpoint
CREATE POLICY "all_actions_by_next_api_key" ON "pipeline_versions" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (is_pipeline_id_accessible_for_api_key(api_key(), pipeline_id));--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "traces" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_trace_id_accessible_for_api_key(api_key(), id));--> statement-breakpoint
CREATE POLICY "Enable insert for authenticated users only" ON "users" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);