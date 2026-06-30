CREATE TABLE "workspace_hard_limit_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"usage_item" text NOT NULL,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_hard_limit_notif_workspace_id_usage_item_unique" UNIQUE("workspace_id","usage_item")
);
--> statement-breakpoint
ALTER TABLE "workspace_hard_limit_notifications" ADD CONSTRAINT "workspace_hard_limit_notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE cascade;
