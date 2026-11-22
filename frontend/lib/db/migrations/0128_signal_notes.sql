CREATE TABLE "signal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"source_event_id" uuid,
	"source_trace_id" uuid,
	"source_event_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signal_notes" ADD CONSTRAINT "signal_notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_notes" ADD CONSTRAINT "signal_notes_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_notes" ADD CONSTRAINT "signal_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_notes" ADD CONSTRAINT "signal_notes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signal_notes_project_signal_created_idx" ON "signal_notes" USING btree ("project_id" uuid_ops,"signal_id" uuid_ops,"created_at" timestamptz_ops);