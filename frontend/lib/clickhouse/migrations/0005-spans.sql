ALTER TABLE default.spans ADD COLUMN IF NOT EXISTS "attributes" String;
ALTER TABLE default.spans ADD COLUMN IF NOT EXISTS "parent_span_id" UUID;
ALTER TABLE default.spans ADD COLUMN IF NOT EXISTS "request_model" String;
ALTER TABLE default.spans ADD COLUMN IF NOT EXISTS "response_model" String;