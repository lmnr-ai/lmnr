ALTER TABLE "traces" ADD COLUMN IF NOT EXISTS "root_span_input" text;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN IF NOT EXISTS "root_span_output" text;--> statement-breakpoint

CREATE TABLE "alert_targets" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "alert_id" uuid NOT NULL,
    "project_id" uuid NOT NULL,
    "type" text NOT NULL,
    "integration_id" uuid NOT NULL,
    "channel_id" text,
    "channel_name" text,
    "email" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "project_id" uuid NOT NULL,
    "name" text NOT NULL,
    "source_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_targets" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "report_id" uuid NOT NULL,
    "type" text NOT NULL,
    "integration_id" uuid,
    "channel_id" text,
    "channel_name" text,
    "email" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "type" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "weekdays" integer[] NOT NULL,
    "hour" integer NOT NULL
);
--> statement-breakpoint


ALTER TABLE "alert_targets" ADD CONSTRAINT "alert_targets_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_targets" ADD CONSTRAINT "alert_targets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "alerts" ADD CONSTRAINT "alerts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "report_targets" ADD CONSTRAINT "report_targets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_targets" ADD CONSTRAINT "report_targets_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "reports" ADD CONSTRAINT "reports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint