ALTER TYPE "public"."span_type" ADD VALUE 'TOOL';--> statement-breakpoint
ALTER TABLE "spans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "select_by_next_api_key" ON "spans" AS PERMISSIVE FOR SELECT TO public USING (is_project_id_accessible_for_api_key(api_key(), project_id));--> statement-breakpoint
ALTER POLICY "select_by_next_api_key" ON "traces" TO anon,authenticated USING (is_project_id_accessible_for_api_key(api_key(), project_id));