CREATE TABLE IF NOT EXISTS default.logs
(
    log_id UUID,
    project_id UUID,
    time DateTime64(9, 'UTC'),
    observed_time DateTime64(9, 'UTC'),
    severity_number UInt8,
    severity_text String,
    body String CODEC(ZSTD(3)),
    attributes String CODEC(ZSTD(3)),
    trace_id UUID,
    span_id UUID,
    flags UInt32 DEFAULT 0,
    event_name String DEFAULT '',
    size_bytes UInt64 DEFAULT 0
)
ENGINE = MergeTree()
ORDER BY (project_id, time, trace_id, span_id, log_id)
SETTINGS index_granularity = 8192;

CREATE VIEW IF NOT EXISTS default.logs_v0 SQL SECURITY INVOKER AS
SELECT
    log_id,
    project_id,
    time,
    observed_time,
    severity_number,
    severity_text,
    body,
    attributes,
    trace_id,
    span_id,
    flags,
    event_name
FROM logs
WHERE project_id={project_id:UUID};
