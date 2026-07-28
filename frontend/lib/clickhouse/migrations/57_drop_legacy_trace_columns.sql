-- Drop the traces_agg columns superseded by traces_static (LAM-2026). `metadata`
-- is deliberately KEPT so the previous values stay restorable.
--
-- traces_replacing is untouched here: it is going away wholesale later.
ALTER TABLE default.traces_agg
    DROP COLUMN IF EXISTS session_id,
    DROP COLUMN IF EXISTS user_id,
    DROP COLUMN IF EXISTS top_span_id,
    DROP COLUMN IF EXISTS top_span_name,
    DROP COLUMN IF EXISTS top_span_type,
    DROP COLUMN IF EXISTS has_browser_session,
    DROP COLUMN IF EXISTS internal_metadata;
