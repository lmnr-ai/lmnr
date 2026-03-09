CREATE TABLE "notification_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint


ALTER TABLE "notification_triggers" ADD CONSTRAINT "notification_triggers_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_triggers" ADD CONSTRAINT "notification_triggers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "slack_integrations" DROP CONSTRAINT "slack_integrations_project_id_key";--> statement-breakpoint
ALTER TABLE "slack_integrations" DROP CONSTRAINT "slack_integrations_project_id_fkey";--> statement-breakpoint
ALTER TABLE "slack_integrations" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "slack_integrations" ADD CONSTRAINT "slack_integrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_integrations" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "slack_integrations" ADD CONSTRAINT "slack_integrations_workspace_id_key" UNIQUE("workspace_id");--> statement-breakpoint

ALTER TABLE "slack_channel_to_events" DROP CONSTRAINT "slack_channel_to_events_integration_channel_event_key";--> statement-breakpoint
ALTER TABLE "slack_channel_to_events" ADD COLUMN "notification_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "slack_channel_to_events" ADD COLUMN "channel_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "slack_channel_to_events" ADD CONSTRAINT "slack_channel_to_events_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_channel_to_events" DROP COLUMN "event_name";--> statement-breakpoint
