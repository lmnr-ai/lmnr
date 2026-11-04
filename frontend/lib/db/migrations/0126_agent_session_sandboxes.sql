CREATE TABLE "agent_session_sandbox_repos" (
	"session_id" uuid NOT NULL,
	"repo_id" bigint NOT NULL,
	"repo_full_name" text NOT NULL,
	"repo_dir" text NOT NULL,
	"base_sha" text NOT NULL,
	"base_branch" text,
	"branch_name" text,
	"branch_last_pushed_local_sha" text,
	"branch_remote_head_sha" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_session_sandbox_repos_pkey" PRIMARY KEY("session_id","repo_id")
);
--> statement-breakpoint
CREATE TABLE "agent_session_sandboxes" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "project_environment_llm_profiles" (
	"environment_id" uuid NOT NULL,
	"llm_profile_id" uuid NOT NULL,
	CONSTRAINT "project_environment_llm_profiles_pkey" PRIMARY KEY("environment_id","llm_profile_id")
);
--> statement-breakpoint
CREATE TABLE "project_environment_repos" (
	"environment_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"repo_id" bigint NOT NULL,
	"repo_full_name" text NOT NULL,
	"default_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_environment_repos_pkey" PRIMARY KEY("environment_id","repo_id")
);
--> statement-breakpoint
CREATE TABLE "project_environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"ingest_api_key_id" uuid,
	"ingest_api_key" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_environments_project_id_key" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "agent_session_sandbox_repos" ADD CONSTRAINT "agent_session_sandbox_repos_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_session_sandboxes"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session_sandboxes" ADD CONSTRAINT "agent_session_sandboxes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_integrations" ADD CONSTRAINT "github_integrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_integrations" ADD CONSTRAINT "github_integrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_environment_llm_profiles" ADD CONSTRAINT "project_environment_llm_profiles_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_environment_llm_profiles" ADD CONSTRAINT "project_environment_llm_profiles_llm_profile_id_fkey" FOREIGN KEY ("llm_profile_id") REFERENCES "llm_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_environment_repos" ADD CONSTRAINT "project_environment_repos_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_environment_repos" ADD CONSTRAINT "project_environment_repos_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "github_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_environments" ADD CONSTRAINT "project_environments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_environments" ADD CONSTRAINT "project_environments_ingest_api_key_id_fkey" FOREIGN KEY ("ingest_api_key_id") REFERENCES "project_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_environment_repos_repo_id_idx" ON "project_environment_repos" USING btree ("repo_id");