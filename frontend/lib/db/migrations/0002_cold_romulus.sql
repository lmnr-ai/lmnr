CREATE TABLE IF NOT EXISTS "labeling_queue_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"queue_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"action" jsonb NOT NULL,
	"span_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dataset_datapoints" ALTER COLUMN "target" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "labeling_queue_items" ADD CONSTRAINT "labelling_queue_items_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "public"."labeling_queues"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
