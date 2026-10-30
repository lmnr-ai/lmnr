CREATE TABLE "github_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"installation_id" bigint NOT NULL,
	"account_id" bigint NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"suspended_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_integrations_workspace_id_key" UNIQUE("workspace_id"),
	CONSTRAINT "github_integrations_installation_id_key" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE "project_github_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"repo_id" bigint NOT NULL,
	"repo_full_name" text NOT NULL,
	"default_branch" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_github_repos_project_id_key" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "github_integrations" ADD CONSTRAINT "github_integrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_integrations" ADD CONSTRAINT "github_integrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_github_repos" ADD CONSTRAINT "project_github_repos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_github_repos" ADD CONSTRAINT "project_github_repos_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "github_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_github_repos_repo_id_idx" ON "project_github_repos" USING btree ("repo_id");