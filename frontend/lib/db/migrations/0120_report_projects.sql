CREATE TABLE "report_projects" (
	"report_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_projects_pkey" PRIMARY KEY("report_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "report_projects" ADD CONSTRAINT "report_projects_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_projects" ADD CONSTRAINT "report_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;