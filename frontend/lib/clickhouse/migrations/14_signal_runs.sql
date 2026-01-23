CREATE TABLE IF NOT EXISTS signal_runs
(
    project_id UUID,
    signal_id UUID,
    job_id UUID,
    trigger_id UUID,
    run_id UUID,
    status UInt8,
    event_id UUID,
    error_message String,
    updated_at DateTime64(9, 'UTC'),
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, signal_id, job_id, run_id)
SETTINGS index_granularity = 8192;

CREATE VIEW IF NOT EXISTS signal_runs_v0 SQL SECURITY INVOKER AS
    SELECT
        project_id,
        signal_id,
        job_id,
        trigger_id,
        run_id,
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