ALTER TABLE "traces" ADD CONSTRAINT "traces_pkey" PRIMARY KEY("id","project_id");--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "last_usage_calculation_time" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "traces" ADD CONSTRAINT "traces_project_id_id_unique" UNIQUE("id","project_id");--> statement-breakpoint
