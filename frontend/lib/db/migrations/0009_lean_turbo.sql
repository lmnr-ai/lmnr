ALTER TABLE "workspace_usage" ADD PRIMARY KEY ("workspace_id");--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD COLUMN "label_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD CONSTRAINT "user_usage_workspace_id_key" UNIQUE("workspace_id");--> statement-breakpoint
