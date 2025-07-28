ALTER TABLE default.events ADD COLUMN IF NOT EXISTS "attributes" String;
ALTER table default.evaluation_scores ADD COLUMN IF NOT EXISTS "trace_id" UUID;
ALTER TABLE default.evaluation_scores DROP COLUMN IF EXISTS "label_id";
