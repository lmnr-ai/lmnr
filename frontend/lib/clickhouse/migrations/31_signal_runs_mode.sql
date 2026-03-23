-- Add mode column to signal_runs table (0 = batch, 1 = realtime)
ALTER TABLE signal_runs ADD COLUMN IF NOT EXISTS mode UInt8 DEFAULT 0;

-- Recreate signal_runs_v0 view to include mode
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
        updated_at
    FROM signal_runs FINAL
    WHERE project_id={project_id:UUID};
