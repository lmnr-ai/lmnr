CREATE TABLE "sql_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"query" text NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sql_templates" ADD CONSTRAINT "sql_templates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;