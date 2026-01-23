CREATE TABLE IF NOT EXISTS signal_runs
(
    project_id UUID,
    signal_id UUID,
    job_id UUID,
    run_id UUID,
    status String,
    event_id UUID,
    time DateTime64(9, 'UTC'),
)
ENGINE = ReplacingMergeTree(time)
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