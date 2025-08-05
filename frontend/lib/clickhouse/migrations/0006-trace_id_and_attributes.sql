ALTER TABLE default.events ADD COLUMN IF NOT EXISTS "attributes" String;
ALTER TABLE default.events ADD COLUMN IF NOT EXISTS "user_id" String;
ALTER TABLE default.events ADD COLUMN IF NOT EXISTS "session_id" String;
ALTER TABLE default.events ADD COLUMN IF NOT EXISTS "size_bytes" UInt64;

ALTER table default.evaluation_scores ADD COLUMN IF NOT EXISTS "trace_id" UUID;
ALTER TABLE default.evaluation_scores DROP COLUMN IF EXISTS "label_id";

ALTER TABLE default.spans ADD COLUMN IF NOT EXISTS "trace_type" UInt8;
