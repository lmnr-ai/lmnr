-- Move signal billing from "steps processed" to token-based cost. Store the
-- raw tokens the signal agent spent per run; cost is derived at read time from
-- the current per-token rate so a future rate change re-prices history.
ALTER TABLE signal_runs ADD COLUMN IF NOT EXISTS input_tokens UInt32 DEFAULT 0;
ALTER TABLE signal_runs ADD COLUMN IF NOT EXISTS output_tokens UInt32 DEFAULT 0;
-- Cache-read tokens: a subset of input_tokens, stored raw, billed at a discounted rate.
ALTER TABLE signal_runs ADD COLUMN IF NOT EXISTS cache_read_tokens UInt32 DEFAULT 0;

-- Expose the new token columns through signal_runs_v0.
DROP VIEW IF EXISTS signal_runs_v0;

CREATE VIEW signal_runs_v0 SQL SECURITY INVOKER AS
    SELECT
        project_id,
        signal_id,
        job_id,
        trigger_id,
        run_id,
        trace_id,
        error_message,
        multiIf(status = 0, 'PENDING', status = 1, 'COMPLETED', status = 2, 'FAILED', 'UNKNOWN') AS status,
        multiIf(mode = 0, 'BATCH', mode = 1, 'REALTIME', 'UNKNOWN') AS mode,
        event_id,
        updated_at,
        input_tokens,
        cache_read_tokens,
        output_tokens
    FROM signal_runs FINAL
    WHERE project_id={project_id:UUID};
