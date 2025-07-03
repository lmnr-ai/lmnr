CREATE TABLE "shared_payloads" (
	"payload_id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_payloads" ADD CONSTRAINT "shared_payloads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;