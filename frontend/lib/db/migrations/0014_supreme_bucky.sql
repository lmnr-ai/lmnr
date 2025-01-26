ALTER TABLE "traces" ADD COLUMN "has_browser_session" boolean;--> statement-breakpoint
CREATE INDEX "datasets_project_id_hash_idx" ON "datasets" USING hash ("project_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "evaluations_project_id_hash_idx" ON "evaluations" USING hash ("project_id" uuid_ops);