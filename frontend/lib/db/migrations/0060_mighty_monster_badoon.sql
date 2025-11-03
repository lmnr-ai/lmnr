CREATE TABLE "dataset_export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_export_jobs_project_dataset_key" UNIQUE("dataset_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "dataset_parquets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dataset_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"parquet_path" text NOT NULL,
	"job_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text
);

ALTER TABLE "dataset_export_jobs" ADD CONSTRAINT "dataset_export_jobs_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_export_jobs" ADD CONSTRAINT "dataset_export_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_parquets" ADD CONSTRAINT "dataset_parquets_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint