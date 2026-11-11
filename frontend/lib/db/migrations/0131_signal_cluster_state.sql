CREATE TABLE "signal_cluster_archives" (
	"cluster_id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"archived_by" uuid,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_cluster_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"status" text NOT NULL,
	"content" text,
	"error" text,
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_cluster_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"cluster_id" uuid NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reopened_by" uuid,
	"reopened_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "signal_cluster_views" (
	"user_id" uuid NOT NULL,
	"cluster_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"last_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signal_cluster_views_pkey" PRIMARY KEY("user_id","cluster_id")
);
--> statement-breakpoint
ALTER TABLE "signal_cluster_archives" ADD CONSTRAINT "signal_cluster_archives_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_archives" ADD CONSTRAINT "signal_cluster_archives_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_archives" ADD CONSTRAINT "signal_cluster_archives_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_reports" ADD CONSTRAINT "signal_cluster_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_reports" ADD CONSTRAINT "signal_cluster_reports_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_resolutions" ADD CONSTRAINT "signal_cluster_resolutions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_resolutions" ADD CONSTRAINT "signal_cluster_resolutions_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_resolutions" ADD CONSTRAINT "signal_cluster_resolutions_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_resolutions" ADD CONSTRAINT "signal_cluster_resolutions_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_views" ADD CONSTRAINT "signal_cluster_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_views" ADD CONSTRAINT "signal_cluster_views_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_cluster_views" ADD CONSTRAINT "signal_cluster_views_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signal_cluster_archives_project_signal_idx" ON "signal_cluster_archives" USING btree ("project_id" uuid_ops,"signal_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "signal_cluster_reports_cluster_created_idx" ON "signal_cluster_reports" USING btree ("cluster_id" uuid_ops,"created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "signal_cluster_reports_project_signal_idx" ON "signal_cluster_reports" USING btree ("project_id" uuid_ops,"signal_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "signal_cluster_resolutions_project_signal_idx" ON "signal_cluster_resolutions" USING btree ("project_id" uuid_ops,"signal_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "signal_cluster_resolutions_one_open_idx" ON "signal_cluster_resolutions" USING btree ("cluster_id" uuid_ops) WHERE (reopened_at IS NULL);--> statement-breakpoint
CREATE INDEX "signal_cluster_views_user_project_idx" ON "signal_cluster_views" USING btree ("user_id" uuid_ops,"project_id" uuid_ops);