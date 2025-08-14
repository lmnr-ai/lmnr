DROP TABLE "dataset_parquets" CASCADE;--> statement-breakpoint
ALTER TABLE "labeling_queues" ADD COLUMN "annotation_schema" jsonb;