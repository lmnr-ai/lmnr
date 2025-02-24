ALTER TABLE "spans" DROP CONSTRAINT "new_spans_trace_id_fkey";
--> statement-breakpoint
CREATE INDEX "project_api_keys_hash_idx" ON "project_api_keys" USING hash ("hash" text_ops);