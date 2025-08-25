ALTER TYPE "public"."span_type" ADD VALUE 'EVENT';--> statement-breakpoint
ALTER TYPE "public"."workspace_role" ADD VALUE 'admin';--> statement-breakpoint
CREATE INDEX "events_span_id_idx" ON "events" USING btree ("span_id" uuid_ops);--> statement-breakpoint
