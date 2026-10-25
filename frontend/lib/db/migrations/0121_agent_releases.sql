CREATE TABLE "agent_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"release" text NOT NULL,
	"version_id" uuid,
	"first_seen" bigint NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_releases_agent_id_release_key" UNIQUE("agent_id","release")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "release_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_releases" ADD CONSTRAINT "agent_releases_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_releases" ADD CONSTRAINT "agent_releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_releases" ADD CONSTRAINT "agent_releases_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "agent_versions"("id") ON DELETE set null ON UPDATE no action;