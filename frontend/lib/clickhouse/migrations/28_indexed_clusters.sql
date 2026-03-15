CREATE TABLE IF NOT EXISTS signal_event_clusters
(
    `id` UUID,
    `project_id` UUID,
    `signal_id` UUID,
    `name` String,
    `level` UInt8,
    `centroid` Array(BFloat16) CODEC(NONE),
    `parent_id` UUID,
    `num_signal_events` UInt32,
    `num_children_clusters` UInt16,
    `created_at` DateTime64(9, 'UTC'),
    `updated_at` DateTime64(9, 'UTC'),
    CONSTRAINT centroid_same_dim CHECK length(centroid) = 3072
)
ENGINE = ReplacingMergeTree(updated_at)
PRIMARY KEY (project_id, signal_id)
ORDER BY (project_id, signal_id, id);

ALTER TABLE signal_event_clusters ADD INDEX centroid_cosine_hnsw centroid TYPE vector_similarity(
    'hnsw',
    cosineDistance,
    3072
);

ALTER TABLE signal_event_clusters MATERIALIZE INDEX centroid_cosine_hnsw;

INSERT INTO signal_event_clusters(
    id,
    project_id,
    signal_id,
    name,
    level,
    centroid,
    parent_id,
    num_signal_events,
    num_children_clusters,
    created_at,
    updated_at
) SELECT
    id,
    project_id,
    signal_id,
    name,
    level,
    centroid,
    parent_id,
    num_signal_events,
    num_children_clusters,
    created_at,
    updated_at
FROM clusters FINAL;

DROP TABLE IF EXISTS clusters;
