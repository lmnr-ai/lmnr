CREATE TABLE "eval_dataset_task_blobs" (
	"project_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eval_dataset_task_blobs_pkey" PRIMARY KEY("project_id","hash")
);
--> statement-breakpoint
CREATE TABLE "eval_dataset_version_tasks" (
	"version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "eval_dataset_version_tasks_pkey" PRIMARY KEY("version_id","name")
);
--> statement-breakpoint
CREATE TABLE "eval_dataset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"parent_version" integer,
	"message" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eval_dataset_versions_dataset_id_version_key" UNIQUE("dataset_id","version")
);
--> statement-breakpoint
CREATE TABLE "eval_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eval_datasets_project_id_name_key" UNIQUE("project_id","name")
);
--> statement-breakpoint
ALTER TABLE "eval_dataset_task_blobs" ADD CONSTRAINT "eval_dataset_task_blobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_dataset_version_tasks" ADD CONSTRAINT "eval_dataset_version_tasks_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "eval_dataset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_dataset_versions" ADD CONSTRAINT "eval_dataset_versions_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "eval_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_dataset_versions" ADD CONSTRAINT "eval_dataset_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_datasets" ADD CONSTRAINT "eval_datasets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;