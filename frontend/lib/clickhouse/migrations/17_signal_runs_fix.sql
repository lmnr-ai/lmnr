-- recreate signal_runs table without the updated_at column in ordering key

DROP TABLE IF EXISTS signal_runs;

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
ORDER BY (project_id, signal_id, run_id)
SETTINGS index_granularity = 8192;

ALTER TABLE signal_runs ADD INDEX IF NOT EXISTS signal_runs_job_id_bf_idx job_id TYPE bloom_filter;
ALTER TABLE signal_runs ADD INDEX IF NOT EXISTS signal_runs_trigger_id_bf_idx trigger_id TYPE bloom_filter;
ALTER TABLE signal_runs ADD INDEX IF NOT EXISTS signal_runs_trace_id_bf_idx trace_id TYPE bloom_filter;
