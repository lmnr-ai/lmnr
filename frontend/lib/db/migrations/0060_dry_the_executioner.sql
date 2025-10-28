CREATE TABLE "slack_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"token" text NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nonce_hex" text NOT NULL,
	"channel_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_integrations" ADD CONSTRAINT "slack_integrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint