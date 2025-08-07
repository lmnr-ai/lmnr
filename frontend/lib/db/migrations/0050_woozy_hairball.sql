CREATE TABLE "dashboard_charts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"query" text NOT NULL,
	"settings" jsonb NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_charts" ADD CONSTRAINT "fk_dashboard_charts_project_id" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;