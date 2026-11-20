CREATE TABLE "datasets_v2" (
	"project_id" uuid NOT NULL,
	"id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "datasets_v2_pkey" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "task_versions" (
	"project_id" uuid NOT NULL,
	"dataset_id" text NOT NULL,
	"task_id" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_versions_pkey" PRIMARY KEY("project_id","dataset_id","task_id","hash")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"project_id" uuid NOT NULL,
	"dataset_id" text NOT NULL,
	"id" text NOT NULL,
	CONSTRAINT "tasks_pkey" PRIMARY KEY("project_id","dataset_id","id")
);
--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "dataset_v2_id" text;--> statement-breakpoint
ALTER TABLE "datasets_v2" ADD CONSTRAINT "datasets_v2_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_versions" ADD CONSTRAINT "task_versions_task_fkey" FOREIGN KEY ("project_id","dataset_id","task_id") REFERENCES "tasks"("project_id","dataset_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_dataset_fkey" FOREIGN KEY ("project_id","dataset_id") REFERENCES "datasets_v2"("project_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "task_versions_created_at_idx" ON "task_versions" USING btree ("project_id","dataset_id","task_id","created_at" DESC NULLS FIRST);