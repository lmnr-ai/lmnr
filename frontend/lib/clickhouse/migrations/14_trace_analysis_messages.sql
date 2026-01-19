CREATE TABLE IF NOT EXISTS trace_analysis_messages
(
    project_id UUID,
    job_id UUID,
    task_id UUID,
    time DateTime64(9, 'UTC'),
    message String
)
ENGINE = MergeTree
ORDER BY (project_id, job_id, task_id, time)
SETTINGS index_granularity = 8192;
