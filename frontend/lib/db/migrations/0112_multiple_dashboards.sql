CREATE TABLE "dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_charts" ADD COLUMN "dashboard_id" uuid;--> statement-breakpoint
INSERT INTO "dashboards" ("project_id", "name") SELECT DISTINCT "project_id", 'Main' FROM "dashboard_charts";--> statement-breakpoint
UPDATE "dashboard_charts" SET "dashboard_id" = "dashboards"."id" FROM "dashboards" WHERE "dashboards"."project_id" = "dashboard_charts"."project_id";--> statement-breakpoint
ALTER TABLE "dashboard_charts" ALTER COLUMN "dashboard_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboards_project_id_idx" ON "dashboards" USING btree ("project_id" uuid_ops);--> statement-breakpoint
ALTER TABLE "dashboard_charts" ADD CONSTRAINT "dashboard_charts_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_charts_dashboard_id_idx" ON "dashboard_charts" USING btree ("dashboard_id" uuid_ops);
