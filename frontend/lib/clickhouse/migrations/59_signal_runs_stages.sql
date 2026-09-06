-- Split the run stages: 3 = PENDING (elected, waiting on the agent), 0 = PROCESSING (agent running, was PENDING).
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
        multiIf(mode = 0, 'BATCH', mode = 1, 'REALTIME', 'UNKNOWN') AS mode,
        event_id,
        updated_at,
        input_tokens,
        cache_read_tokens,
        output_tokens
    FROM signal_runs FINAL
    WHERE project_id={project_id:UUID};
