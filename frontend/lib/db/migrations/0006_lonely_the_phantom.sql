ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluation_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pipeline_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "traces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "playgrounds" ADD COLUMN "prompt_messages" jsonb DEFAULT '[{"role":"user","content":""}]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "playgrounds" ADD COLUMN "model_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "playgrounds" ADD COLUMN "output_schema" text;--> statement-breakpoint
CREATE POLICY "Enable insert for authenticated users only" ON "api_keys" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "evaluation_results" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_evaluation_id_accessible_for_api_key(api_key(), evaluation_id));--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "evaluations" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_evaluation_id_accessible_for_api_key(api_key(), id));--> statement-breakpoint
CREATE POLICY "all_actions_by_next_api_key" ON "pipeline_versions" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (is_pipeline_id_accessible_for_api_key(api_key(), pipeline_id));--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "traces" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_trace_id_accessible_for_api_key(api_key(), id));--> statement-breakpoint
CREATE POLICY "Enable insert for authenticated users only" ON "users" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);