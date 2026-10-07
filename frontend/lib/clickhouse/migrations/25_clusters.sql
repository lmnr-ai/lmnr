CREATE TABLE IF NOT EXISTS clusters
(
    `id` UUID,
    `project_id` UUID,
    `signal_id` UUID,
    `name` String,
    `level` UInt8,
    `centroid` Array(BFloat16),
    `parent_id` UUID,
    `num_signal_events` UInt32,
    `num_children_clusters` UInt16,
    `created_at` DateTime64(9, 'UTC'),
    `updated_at` DateTime64(9, 'UTC'),
    `version` UInt32
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (project_id, signal_id, id)
SETTINGS index_granularity = 8192;

CREATE VIEW IF NOT EXISTS clusters_v0
SQL SECURITY INVOKER
AS SELECT
    id,
    signal_id,
    name,
    level,
    centroid,
    parent_id,
    num_signal_events,
    num_children_clusters,
    created_at,
    updated_at
FROM clusters
FINAL
WHERE project_id = {project_id:UUID};
