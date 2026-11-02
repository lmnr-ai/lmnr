DROP TABLE "agent_version_models" CASCADE;--> statement-breakpoint
DROP TABLE "agent_versions" CASCADE;--> statement-breakpoint
DROP TABLE "agents" CASCADE;--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_hash" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"labeled_until" bigint,
	"watermark" bigint,
	"current_version_id" uuid,
	CONSTRAINT "agents_project_id_agent_hash_key" UNIQUE("project_id","agent_hash")
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"version_hash" text NOT NULL,
	"version_number" integer NOT NULL,
	"core_lines" bigint[] NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"tool_definitions" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_versions_project_id_version_hash_key" UNIQUE("project_id","version_hash"),
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
ALTER TABLE "agents" ADD CONSTRAINT "agents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_models" ADD CONSTRAINT "agent_version_models_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_models" ADD CONSTRAINT "agent_version_models_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
