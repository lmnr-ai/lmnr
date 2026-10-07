DROP VIEW IF EXISTS clusters_v0;
CREATE VIEW IF NOT EXISTS clusters_v0
SQL SECURITY INVOKER
AS SELECT
    id,
    signal_id,
    name,
    level,
    parent_id,
    num_signal_events,
    num_children_clusters,
    created_at,
    updated_at
FROM default.signal_event_clusters
FINAL
PREWHERE project_id = {project_id:UUID}
WHERE level > 0;
