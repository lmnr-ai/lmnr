CREATE TABLE "event_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"prompt" text,
	"project_id" uuid NOT NULL,
	"is_semantic" boolean DEFAULT false NOT NULL,
	"structured_output" jsonb,
	CONSTRAINT "event_definitions_project_id_name_key" UNIQUE("name","project_id")
);
--> statement-breakpoint
CREATE TABLE "summary_trigger_spans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"span_name" text NOT NULL,
	"event_name" text,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_definitions" ADD CONSTRAINT "event_definitions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_trigger_spans" ADD CONSTRAINT "summary_trigger_spans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint