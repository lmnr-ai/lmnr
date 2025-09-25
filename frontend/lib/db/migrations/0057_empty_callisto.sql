CREATE TABLE "project_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"value" text,
	"project_id" uuid DEFAULT gen_random_uuid() NOT NULL
);
ALTER TABLE "project_settings" ADD CONSTRAINT "project_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
