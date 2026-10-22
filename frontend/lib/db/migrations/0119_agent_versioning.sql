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
ALTER TABLE "agent_versions" DROP CONSTRAINT "agent_versions_project_id_version_hash_key";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "labelled_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "held_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_version_changes" ADD CONSTRAINT "agent_version_changes_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_changes" ADD CONSTRAINT "agent_version_changes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_changes" ADD CONSTRAINT "agent_version_changes_from_version_id_fkey" FOREIGN KEY ("from_version_id") REFERENCES "agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_changes" ADD CONSTRAINT "agent_version_changes_to_version_id_fkey" FOREIGN KEY ("to_version_id") REFERENCES "agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DELETE FROM "agent_versions";--> statement-breakpoint
ALTER TABLE "agent_versions" DROP COLUMN "version_hash";--> statement-breakpoint
ALTER TABLE "agent_versions" DROP COLUMN "system_prompt_version_hash";--> statement-breakpoint
ALTER TABLE "agent_versions" DROP COLUMN "tool_definitions_hash";--> statement-breakpoint
ALTER TABLE "agent_versions" ADD COLUMN "core" bigint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD COLUMN "content" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD COLUMN "since" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD COLUMN "example_trace_id" uuid NOT NULL;