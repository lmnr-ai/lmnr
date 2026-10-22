DROP TABLE IF EXISTS "agent_version_models" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_versions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "agents" CASCADE;--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_hash" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"labelled_until" timestamp with time zone,
	"held_until" timestamp with time zone,
	CONSTRAINT "agents_project_id_agent_hash_key" UNIQUE("project_id","agent_hash")
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"core" bigint[] NOT NULL,
	"content" text NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"example_trace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_versions_agent_id_version_number_key" UNIQUE("agent_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "agent_version_models" (
	"project_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_version_models_pkey" PRIMARY KEY("agent_version_id","model")
);
--> statement-breakpoint
CREATE TABLE "agent_version_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"change_number" integer NOT NULL,
	"from_version_id" uuid,
	"to_version_id" uuid NOT NULL,
	"overlap_from" timestamp with time zone NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"added" bigint[] NOT NULL,
	"removed" bigint[] NOT NULL,
	"example_trace_before" uuid,
	"example_trace_after" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_version_changes_agent_id_change_number_key" UNIQUE("agent_id","change_number")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_models" ADD CONSTRAINT "agent_version_models_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_models" ADD CONSTRAINT "agent_version_models_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_changes" ADD CONSTRAINT "agent_version_changes_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_changes" ADD CONSTRAINT "agent_version_changes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_changes" ADD CONSTRAINT "agent_version_changes_from_version_id_fkey" FOREIGN KEY ("from_version_id") REFERENCES "agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_changes" ADD CONSTRAINT "agent_version_changes_to_version_id_fkey" FOREIGN KEY ("to_version_id") REFERENCES "agent_versions"("id") ON DELETE cascade ON UPDATE no action;
