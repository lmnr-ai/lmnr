CREATE TABLE IF NOT EXISTS events_to_clusters
(
    project_id UUID,
    event_id   UUID,
    cluster_id UUID,
    content    String,
    created_at DateTime64(9, 'UTC') default now64(9)
)
ENGINE = MergeTree()
ORDER BY (project_id, event_id, cluster_id)
SETTINGS index_granularity = 8192;
