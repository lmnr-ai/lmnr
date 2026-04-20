ALTER TABLE signal_events ADD COLUMN IF NOT EXISTS severity UInt8 DEFAULT 0;

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
