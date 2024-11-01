CREATE TABLE IF NOT EXISTS "labeling_queue_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"index_in_batch" bigint DEFAULT '0' NOT NULL,
	"queue_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"data" jsonb NOT NULL,
	"action" jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "labeling_queue_data" ADD CONSTRAINT "labelling_queue_data_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "public"."labeling_queues"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
