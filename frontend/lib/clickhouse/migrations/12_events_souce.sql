ALTER TABLE events
ADD COLUMN IF NOT EXISTS source LowCardinality(String) DEFAULT 'CODE';


DROP VIEW IF EXISTS events_v0;

CREATE VIEW IF NOT EXISTS default.events_v0 SQL SECURITY INVOKER AS
    SELECT
       events.id,
       events.span_id,
       events.name,
       events.timestamp,
       events.attributes,
       events.user_id,
       events.session_id,
       events.trace_id AS trace_id,
       events.source as source,
       c.clusters AS clusters
   FROM default.events
            LEFT JOIN
        (
            SELECT
                project_id,
                event_id,
                arrayDistinct(groupArray(cluster_id)) AS clusters
            FROM default.events_to_clusters
            WHERE project_id = {project_id:UUID}
            GROUP BY
                project_id,
                event_id
        ) AS c ON (events.project_id = c.project_id) AND (events.id = c.event_id)
   WHERE events.project_id = {project_id:UUID}