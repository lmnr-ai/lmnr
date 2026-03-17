ALTER TABLE "slack_channel_to_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "slack_channel_to_events" CASCADE;--> statement-breakpoint
ALTER TABLE "slack_integrations" DROP CONSTRAINT "slack_integrations_project_id_key";--> statement-breakpoint
ALTER TABLE "slack_integrations" DROP CONSTRAINT "slack_integrations_project_id_fkey";
--> statement-breakpoint
ALTER TABLE "slack_integrations" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "slack_integrations" ADD CONSTRAINT "slack_integrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_integrations" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "slack_integrations" ADD CONSTRAINT "slack_integrations_workspace_id_key" UNIQUE("workspace_id");