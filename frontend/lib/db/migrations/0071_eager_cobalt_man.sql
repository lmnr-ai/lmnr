ALTER TABLE "labeling_queue_items" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "labeling_queue_items_queue_id_idempotency_key_idx" ON "labeling_queue_items" USING btree ("queue_id" uuid_ops,"idempotency_key" text_ops) WHERE (idempotency_key IS NOT NULL);--> statement-breakpoint
