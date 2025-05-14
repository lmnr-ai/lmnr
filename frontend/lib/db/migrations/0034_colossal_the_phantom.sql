ALTER TABLE "labeling_queue_items" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "labeling_queue_items" ADD COLUMN "payload" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "labeling_queue_items" DROP COLUMN "action";--> statement-breakpoint
ALTER TABLE "labeling_queue_items" DROP COLUMN "span_id";