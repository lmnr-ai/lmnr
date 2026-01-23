CREATE TABLE IF NOT EXISTS signal_runs
(
    project_id UUID,
    signal_id UUID,
    job_id UUID,
    run_id UUID,
    status UInt8,
    event_id UUID,
    error_message String,
    updated_at DateTime64(9, 'UTC'),
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, signal_id, job_id, run_id)
SETTINGS index_granularity = 8192;

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