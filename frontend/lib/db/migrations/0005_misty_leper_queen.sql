ALTER TYPE "public"."label_source" ADD VALUE 'CODE';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "playgrounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "spans_project_id_idx" ON "spans" USING hash ("project_id");