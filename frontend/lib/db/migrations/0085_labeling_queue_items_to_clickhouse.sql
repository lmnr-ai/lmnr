-- Labeling queue items moved to ClickHouse (migration 42_labeling_queue_items.sql).
-- The Postgres table is no longer read or written by the application.
DROP TABLE IF EXISTS "labeling_queue_items" CASCADE;--> statement-breakpoint

-- "annotation_schema" was confusing because items don't carry annotations; they carry a
-- mutable target payload. Rename to match the domain vocabulary used elsewhere in the UI.
ALTER TABLE "labeling_queues" RENAME COLUMN "annotation_schema" TO "target_schema";--> statement-breakpoint
