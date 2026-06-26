CREATE TABLE "slack_channel_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" text NOT NULL,
	"channel_name" text,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_channel_projects" ADD CONSTRAINT "slack_channel_projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_channel_projects" ADD CONSTRAINT "slack_channel_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slack_channel_projects_workspace_channel_idx" ON "slack_channel_projects" USING btree ("workspace_id" uuid_ops,"channel_id" text_ops);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_chat_external_key" ON "chat_messages" USING btree ("chat_id","external_id") WHERE "external_id" IS NOT NULL;
