ALTER TABLE signal_event_clusters ADD INDEX IF NOT EXISTS clusters_project_id_cluster_id_idx (project_id, id) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE signal_event_clusters MATERIALIZE INDEX clusters_project_id_cluster_id_idx;

DROP VIEW IF EXISTS default.signal_events_v0;
CREATE VIEW IF NOT EXISTS signal_events_v0
SQL SECURITY INVOKER
AS
SELECT * FROM (
    SELECT
        id,
        project_id,
        signal_id,
        trace_id,
        run_id,
        name,
        payload,
        timestamp,
        ca.clusters AS clusters
    FROM default.signal_events
    LEFT JOIN
    (
        SELECT
            e.project_id,
            e.event_id,
            arrayDistinct(groupArray(e.cluster_id)) AS clusters
        FROM events_to_clusters e FINAL
        JOIN signal_event_clusters c FINAL ON e.project_id = c.project_id AND e.cluster_id = c.id AND c.level > 0
        PREWHERE e.project_id = {project_id:UUID}
        GROUP BY
            e.project_id,
            event_id
    ) AS ca ON (signal_events.project_id = ca.project_id) AND (signal_events.id = ca.event_id)
WHERE signal_events.project_id = {project_id:UUID});

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
FROM default.signal_event_clusters
FINAL
PREWHERE project_id = {project_id:UUID}
WHERE level > 0;
