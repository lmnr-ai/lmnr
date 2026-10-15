-- Signals gateway calls on Laminar Cloud are billed as signal runs: one
-- completed `signal_runs` row per call with mode = 2 and nil signal, job,
-- trigger, trace and event ids. Recreate the view to label that mode; the body
-- is otherwise unchanged from migration 69.
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
        multiIf(
            status = 0, 'PROCESSING',
            status = 1, 'COMPLETED',
            status = 2, 'FAILED',
            status = 3, 'PENDING',
            'UNKNOWN'
        ) AS status,
        multiIf(mode = 0, 'BATCH', mode = 1, 'REALTIME', mode = 2, 'GATEWAY', 'UNKNOWN') AS mode,
        event_id,
        updated_at,
        input_tokens,
        cache_read_tokens,
        output_tokens,
        signal_version,
        credit_applied
    FROM signal_runs FINAL
    WHERE project_id={project_id:UUID};
