CREATE TABLE IF NOT EXISTS "agent_sandboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"ext_sandbox_id" text,
	"expires_at" timestamp with time zone,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ext_snapshot_id" text,
	"ext_snapshot_expires_at" timestamp with time zone,
	"openable_by_id" boolean DEFAULT true NOT NULL,
	"api_key_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_sandbox_repos" (
	"sandbox_id" uuid NOT NULL,
	"repo_id" bigint NOT NULL,
	"repo_full_name" text NOT NULL,
	"repo_dir" text NOT NULL,
	"base_sha" text NOT NULL,
	"base_branch" text,
	"branch_name" text,
	"branch_last_pushed_local_sha" text,
	"branch_remote_head_sha" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_sandbox_repos_pkey" PRIMARY KEY("sandbox_id","repo_id")
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN IF NOT EXISTS "sandbox_id" uuid;--> statement-breakpoint
-- Live sandboxes keep their state: each becomes a project sandbox whose id is its session's id. Their keys (named
-- after the session) aren't tracked and expire on their own within the hour. Only ui/cli sessions held secrets.
DO $$
BEGIN
	IF to_regclass('agent_session_sandboxes') IS NOT NULL THEN
		INSERT INTO "agent_sandboxes" ("id", "project_id", "ext_sandbox_id", "expires_at", "last_active_at", "openable_by_id", "created_at", "updated_at")
		SELECT s."session_id", a."project_id", s."sandbox_id", s."expires_at", s."updated_at", a."source" IN ('ui', 'cli'), s."created_at", s."updated_at"
		FROM "agent_session_sandboxes" s
		JOIN "agent_sessions" a ON a."id" = s."session_id"
		WHERE s."expires_at" > now()
		ON CONFLICT DO NOTHING;
		INSERT INTO "agent_sandbox_repos" ("sandbox_id", "repo_id", "repo_full_name", "repo_dir", "base_sha", "base_branch", "branch_name", "branch_last_pushed_local_sha", "branch_remote_head_sha", "updated_at")
		SELECT r."session_id", r."repo_id", r."repo_full_name", r."repo_dir", r."base_sha", r."base_branch", r."branch_name", r."branch_last_pushed_local_sha", r."branch_remote_head_sha", r."updated_at"
		FROM "agent_session_sandbox_repos" r
		JOIN "agent_sandboxes" b ON b."id" = r."session_id"
		ON CONFLICT DO NOTHING;
		UPDATE "agent_sessions" SET "sandbox_id" = "id" WHERE "id" IN (SELECT "id" FROM "agent_sandboxes") AND "sandbox_id" IS NULL;
	END IF;
END $$;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_session_sandbox_repos";--> statement-breakpoint
DROP TABLE IF EXISTS "agent_session_sandboxes";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "agent_sandboxes" ADD CONSTRAINT "agent_sandboxes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "agent_sandbox_repos" ADD CONSTRAINT "agent_sandbox_repos_sandbox_id_fkey" FOREIGN KEY ("sandbox_id") REFERENCES "agent_sandboxes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_sandbox_id_fkey" FOREIGN KEY ("sandbox_id") REFERENCES "agent_sandboxes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_sandboxes_project_id_idx" ON "agent_sandboxes" USING btree ("project_id","last_active_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_sandboxes_ext_sandbox_id_key" ON "agent_sandboxes" USING btree ("ext_sandbox_id");
