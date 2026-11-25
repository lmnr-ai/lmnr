CREATE TABLE "linear_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"organization_name" text NOT NULL,
	"organization_url_key" text NOT NULL,
	"access_token" text NOT NULL,
	"access_token_nonce" text NOT NULL,
	"refresh_token" text,
	"refresh_token_nonce" text,
	"expires_at" timestamp with time zone,
	"scope" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "linear_integrations_workspace_id_key" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "project_linear_settings" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_cluster_linear_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"cluster_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"linear_issue_id" text NOT NULL,
	"previous_linear_issue_id" text,
	"origin" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"comment_id" text,
	"evaluation_attachment_id" text,
	"evaluation_url" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "linear_integrations" ADD CONSTRAINT "linear_integrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_integrations" ADD CONSTRAINT "linear_integrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_linear_settings" ADD CONSTRAINT "project_linear_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_linear_settings" ADD CONSTRAINT "project_linear_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_linear_issues" ADD CONSTRAINT "signal_cluster_linear_issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_linear_issues" ADD CONSTRAINT "signal_cluster_linear_issues_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_linear_issues" ADD CONSTRAINT "signal_cluster_linear_issues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signal_cluster_linear_issues_current_idx" ON "signal_cluster_linear_issues" USING btree ("project_id" uuid_ops,"cluster_id" uuid_ops) WHERE (superseded_at IS NULL);--> statement-breakpoint
CREATE INDEX "signal_cluster_linear_issues_project_signal_idx" ON "signal_cluster_linear_issues" USING btree ("project_id" uuid_ops,"signal_id" uuid_ops);