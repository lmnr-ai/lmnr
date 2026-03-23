CREATE TABLE IF NOT EXISTS new_events_to_clusters
(
    project_id UUID,
    event_id   UUID,
    cluster_id UUID,
    content    String,
    created_at DateTime64(9, 'UTC') default now64(9)
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (project_id, event_id, cluster_id)
SETTINGS index_granularity = 8192;

INSERT INTO new_events_to_clusters(
    project_id,
    event_id,
    cluster_id,
    content,
    created_at
)
SELECT project_id, event_id, cluster_id, content, created_at
FROM events_to_clusters;

RENAME TABLE events_to_clusters TO old_events_to_clusters;
RENAME TABLE new_events_to_clusters TO events_to_clusters;

DROP TABLE IF EXISTS old_events_to_clusters;
