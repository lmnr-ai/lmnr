CREATE TABLE "eval_agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"eval_agent_id" uuid NOT NULL,
	"number" integer,
	"hash" text NOT NULL,
	"git_sha" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eval_agent_versions_eval_agent_id_hash_key" UNIQUE("eval_agent_id","hash"),
	CONSTRAINT "eval_agent_versions_eval_agent_id_number_key" UNIQUE("eval_agent_id","number")
);
--> statement-breakpoint
CREATE TABLE "eval_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"head_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eval_agents_project_id_name_key" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "task_set_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"task_set_id" uuid NOT NULL,
	"parent_id" uuid,
	"number" integer,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_set_versions_task_set_id_hash_key" UNIQUE("task_set_id","hash"),
	CONSTRAINT "task_set_versions_task_set_id_number_key" UNIQUE("task_set_id","number")
);
--> statement-breakpoint
CREATE TABLE "task_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"eval_agent_id" uuid NOT NULL,
	"name" text NOT NULL,
	"head_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_sets_eval_agent_id_name_key" UNIQUE("eval_agent_id","name")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"task_set_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"digest" text NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "tasks_task_set_version_id_name_key" UNIQUE("task_set_version_id","name")
);
--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "eval_agent_version_id" uuid;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "task_set_version_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_agent_versions" ADD CONSTRAINT "eval_agent_versions_eval_agent_id_fkey" FOREIGN KEY ("eval_agent_id") REFERENCES "eval_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_agent_versions" ADD CONSTRAINT "eval_agent_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_agents" ADD CONSTRAINT "eval_agents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_agents" ADD CONSTRAINT "eval_agents_head_version_id_fkey" FOREIGN KEY ("head_version_id") REFERENCES "eval_agent_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_set_versions" ADD CONSTRAINT "task_set_versions_task_set_id_fkey" FOREIGN KEY ("task_set_id") REFERENCES "task_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_set_versions" ADD CONSTRAINT "task_set_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_set_versions" ADD CONSTRAINT "task_set_versions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "task_set_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sets" ADD CONSTRAINT "task_sets_eval_agent_id_fkey" FOREIGN KEY ("eval_agent_id") REFERENCES "eval_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sets" ADD CONSTRAINT "task_sets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sets" ADD CONSTRAINT "task_sets_head_version_id_fkey" FOREIGN KEY ("head_version_id") REFERENCES "task_set_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_task_set_version_id_fkey" FOREIGN KEY ("task_set_version_id") REFERENCES "task_set_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_project_id_digest_idx" ON "tasks" USING btree ("project_id","digest");--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_eval_agent_version_id_fkey" FOREIGN KEY ("eval_agent_version_id") REFERENCES "eval_agent_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_task_set_version_id_fkey" FOREIGN KEY ("task_set_version_id") REFERENCES "task_set_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluations_task_set_version_id_idx" ON "evaluations" USING btree ("task_set_version_id");