CREATE TABLE "slack_channel_to_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"integration_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slack_channel_to_events_integration_channel_event_key" UNIQUE("channel_id","event_name","integration_id")
);
--> statement-breakpoint
CREATE TABLE "slack_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"token" text NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nonce_hex" text NOT NULL,
	CONSTRAINT "slack_integrations_project_id_key" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "project_settings" ALTER COLUMN "project_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "slack_channel_to_events" ADD CONSTRAINT "slack_channel_to_events_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."slack_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_integrations" ADD CONSTRAINT "slack_integrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_definitions" ADD CONSTRAINT "event_definitions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;