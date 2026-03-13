CREATE TABLE IF NOT EXISTS notification_log (
    id UUID DEFAULT generateUUIDv4(),
    workspace_id UUID,
    project_id UUID,
    notification_type LowCardinality(String),
    channel LowCardinality(String),
    recipient String,
    subject String,
    body String,
    event_name String,
    status LowCardinality(String),
    error String DEFAULT '',
    created_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
ORDER BY (workspace_id, created_at)
TTL toDateTime(created_at) + INTERVAL 90 DAY;
