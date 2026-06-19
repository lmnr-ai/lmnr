-- L0-inclusive views used by the "emerging cluster" UI path.
-- clusters_v0 / signal_events_v0 intentionally hide L0 clusters.
-- These views expose the same information but WITHOUT filtering L0 out,
-- so the frontend can resolve an event's cluster (including L0) and list
-- events that belong to an L0 cluster.

CREATE VIEW IF NOT EXISTS event_clusters_all_v0
SQL SECURITY INVOKER
AS
SELECT
    e.event_id AS event_id,
    e.cluster_id AS cluster_id,
    c.signal_id AS signal_id,
    c.level AS level,
    c.name AS cluster_name,
    c.parent_id AS parent_id,
    c.num_signal_events AS num_signal_events,
    c.num_children_clusters AS num_children_clusters,
    c.created_at AS created_at,
    c.updated_at AS updated_at
FROM default.events_to_clusters AS e FINAL
INNER JOIN default.signal_event_clusters AS c FINAL
    ON e.project_id = c.project_id AND e.cluster_id = c.id
PREWHERE e.project_id = {project_id:UUID};

CREATE VIEW IF NOT EXISTS signal_events_all_v0
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
        severity,
        summary,
        ca.clusters AS clusters
    FROM default.signal_events
    LEFT JOIN
    (
        SELECT
            e.project_id,
            e.event_id,
            arrayDistinct(groupArray(e.cluster_id)) AS clusters
        FROM events_to_clusters e FINAL
        PREWHERE e.project_id = {project_id:UUID}
        GROUP BY
            e.project_id,
            event_id
    ) AS ca ON (signal_events.project_id = ca.project_id) AND (signal_events.id = ca.event_id)
WHERE signal_events.project_id = {project_id:UUID});


-- Add "summary" field to signal_events_v0
DROP VIEW IF EXISTS default.signal_events_v0;
CREATE VIEW signal_events_v0
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
        severity,
        summary,
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
