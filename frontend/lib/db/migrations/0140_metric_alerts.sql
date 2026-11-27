CREATE TABLE "metric_alert_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"alert_id" uuid NOT NULL,
	"group_key" text DEFAULT '' NOT NULL,
	"level" text NOT NULL,
	"peak_level" text NOT NULL,
	"peak_value" double precision NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"escalated_at" timestamp with time zone,
	"reopened_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"last_notified_at" timestamp with time zone,
	"slack_threads" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_alert_states" (
	"alert_id" uuid NOT NULL,
	"group_key" text DEFAULT '' NOT NULL,
	"project_id" uuid NOT NULL,
	"level" text DEFAULT 'ok' NOT NULL,
	"streak_level" text DEFAULT 'ok' NOT NULL,
	"streak_count" integer DEFAULT 0 NOT NULL,
	"last_processed_at" timestamp with time zone,
	"last_value" double precision,
	"current_incident_id" uuid,
	"rule_fingerprint" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_alert_states_pkey" PRIMARY KEY("alert_id","group_key")
);
--> statement-breakpoint
ALTER TABLE "metric_alert_incidents" ADD CONSTRAINT "metric_alert_incidents_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_alert_incidents" ADD CONSTRAINT "metric_alert_incidents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_alert_states" ADD CONSTRAINT "metric_alert_states_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_alert_states" ADD CONSTRAINT "metric_alert_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_alert_states" ADD CONSTRAINT "metric_alert_states_current_incident_id_fkey" FOREIGN KEY ("current_incident_id") REFERENCES "metric_alert_incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "metric_alert_incidents_alert_group_opened_idx" ON "metric_alert_incidents" USING btree ("alert_id" uuid_ops,"group_key" text_ops,"opened_at" timestamptz_ops);