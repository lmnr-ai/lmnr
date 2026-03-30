CREATE TABLE "workspace_usage_warnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"usage_item" text NOT NULL,
	"limit_value" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_notified_at" timestamp with time zone,
	CONSTRAINT "workspace_usage_warnings_workspace_id_usage_item_limit_value_unique" UNIQUE("workspace_id","usage_item","limit_value")
);
--> statement-breakpoint
ALTER TABLE "workspace_usage_warnings" ADD CONSTRAINT "workspace_usage_warnings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE cascade;
