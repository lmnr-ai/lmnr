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
FROM signal_event_clusters
FINAL
WHERE project_id = {project_id:UUID};
