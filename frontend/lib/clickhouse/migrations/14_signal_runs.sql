CREATE TABLE IF NOT EXISTS signal_runs
(
    project_id UUID,
    signal_id UUID,
    job_id UUID,
    trigger_id UUID,
    run_id UUID,
    trace_id UUID,
    status UInt8,
    event_id UUID,
    error_message String,
    updated_at DateTime64(9, 'UTC'),
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, signal_id, updated_at, run_id)
SETTINGS index_granularity = 8192;

ALTER TABLE signal_runs ADD INDEX IF NOT EXISTS signal_runs_job_id_bf_idx job_id TYPE bloom_filter;
ALTER TABLE signal_runs ADD INDEX IF NOT EXISTS signal_runs_trigger_id_bf_idx trigger_id TYPE bloom_filter;
ALTER TABLE signal_runs ADD INDEX IF NOT EXISTS signal_runs_trace_id_bf_idx trace_id TYPE bloom_filter;

CREATE VIEW IF NOT EXISTS signal_runs_v0 SQL SECURITY INVOKER AS
    SELECT
        project_id,
        signal_id,
        job_id,
        trigger_id,
        run_id,
        trace_id,
        CASE
            WHEN status = 0 THEN 'PENDING'
            WHEN status = 1 THEN 'COMPLETED'
            WHEN status = 2 THEN 'FAILED'
            ELSE 'UNKNOWN'
        END AS status,
        event_id,
        updated_at,
    FROM signal_runs FINAL
    WHERE project_id={project_id:UUID};

GRANT SELECT ON signal_runs TO sql_readonly_scoped;

CREATE TABLE IF NOT EXISTS signal_run_messages
(
    project_id UUID,
    run_id UUID,
    time DateTime64(9, 'UTC'),
    message String
)
ENGINE = MergeTree
ORDER BY (project_id, run_id, time)
SETTINGS index_granularity = 8192;