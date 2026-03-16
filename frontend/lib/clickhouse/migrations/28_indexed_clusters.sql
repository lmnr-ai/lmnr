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

DROP VIEW IF EXISTS clusters_v0;

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

DROP VIEW IF EXISTS signal_events_v0;

CREATE VIEW default.signal_events_v0
SQL SECURITY INVOKER
AS SELECT
    id,
    project_id,
    signal_id,
    trace_id,
    run_id,
    name,
    payload,
    timestamp,
    c.clusters AS clusters
FROM default.signal_events
LEFT JOIN
(
    SELECT
        project_id,
        event_id,
        arrayDistinct(groupArray(cluster_id)) AS clusters
    FROM default.events_to_clusters
    FINAL
    WHERE project_id = {project_id:UUID}
    GROUP BY
        project_id,
        event_id
) AS c ON (signal_events.project_id = c.project_id) AND (signal_events.id = c.event_id)
WHERE signal_events.project_id = {project_id:UUID};
