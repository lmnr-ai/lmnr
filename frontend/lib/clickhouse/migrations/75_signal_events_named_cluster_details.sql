-- The CAST names the `cluster_details` tuple elements so `c.name` / `c.level`
-- work, matching the documented schema and the `traces` cluster columns. A bare
-- tuple() is positional only, and the query-engine parser rejects `c.2`.
-- Bodies are verbatim from migration 73 apart from the CAST.

DROP VIEW IF EXISTS default.signal_events_v0;
CREATE VIEW signal_events_v0
SQL SECURITY INVOKER
AS
SELECT
    e.id AS id,
    e.project_id AS project_id,
    e.signal_id AS signal_id,
    dictGetOrDefault('signals_dict', 'name', (e.project_id, e.signal_id), '') AS signal_name,
    e.trace_id AS trace_id,
    e.run_id AS run_id,
    signal_name AS name,
    e.payload AS payload,
    e.timestamp AS timestamp,
    e.severity AS severity,
    e.signal_version AS signal_version,
    arrayFilter(
        c -> dictGetOrDefault('clusters_dict', 'level', (e.project_id, c), toUInt8(0)) >= 1,
        ifNull(ca.all_cluster_ids, [])
    ) AS clusters,
    arrayFilter(
        c -> dictGetOrDefault('clusters_dict', 'level', (e.project_id, c), toUInt8(0)) = 1,
        ifNull(ca.all_cluster_ids, [])
    ) AS leaf_clusters,
    CAST(arrayMap(
        c -> tuple(
            c,
            dictGetOrDefault('clusters_dict', 'name', (e.project_id, c), ''),
            dictGetOrDefault('clusters_dict', 'level', (e.project_id, c), toUInt8(0))
        ),
        arrayFilter(
            c -> dictGetOrDefault('clusters_dict', 'level', (e.project_id, c), toUInt8(0)) >= 1,
            ifNull(ca.all_cluster_ids, [])
        )
    ), 'Array(Tuple(id UUID, name String, level UInt8))') AS cluster_details
FROM default.signal_events AS e
LEFT JOIN
(
    SELECT
        project_id,
        signal_id,
        event_id,
        arrayFilter(
            c -> dictHas('clusters_dict', (project_id, c)),
            arrayDistinct(arrayFlatten(arrayMap(
                c -> arrayPushFront(
                    dictGetOrDefault('clusters_dict', 'path', (project_id, c), []),
                    c
                ),
                groupUniqArray(cluster_id)
            )))
        ) AS all_cluster_ids
    FROM default.signal_event_summaries
    PREWHERE project_id = {project_id:UUID}
        AND (empty({signal_ids:Array(UUID)}) OR signal_id IN {signal_ids:Array(UUID)})
    GROUP BY project_id, signal_id, event_id
-- Grouped and joined on `(project_id, signal_id, event_id)`, the summaries sort
-- key's leading columns. An event belongs to exactly one signal, so carrying
-- `signal_id` through the GROUP BY splits no row -- it just stops a bare
-- `event_id` match from having to be trusted on its own.
) AS ca ON (e.project_id = ca.project_id) AND (e.signal_id = ca.signal_id) AND (e.id = ca.event_id)
WHERE e.project_id = {project_id:UUID};

DROP VIEW IF EXISTS default.signal_events_all_v0;
CREATE VIEW signal_events_all_v0
SQL SECURITY INVOKER
AS
SELECT
    e.id AS id,
    e.project_id AS project_id,
    e.signal_id AS signal_id,
    dictGetOrDefault('signals_dict', 'name', (e.project_id, e.signal_id), '') AS signal_name,
    e.trace_id AS trace_id,
    e.run_id AS run_id,
    signal_name AS name,
    e.payload AS payload,
    e.timestamp AS timestamp,
    e.severity AS severity,
    e.summary AS summary,
    e.signal_version AS signal_version,
    ifNull(ca.all_cluster_ids, []) AS clusters,
    arrayFilter(
        c -> dictGetOrDefault('clusters_dict', 'level', (e.project_id, c), toUInt8(0)) = 1,
        ifNull(ca.all_cluster_ids, [])
    ) AS leaf_clusters,
    CAST(arrayMap(
        c -> tuple(
            c,
            dictGetOrDefault('clusters_dict', 'name', (e.project_id, c), ''),
            dictGetOrDefault('clusters_dict', 'level', (e.project_id, c), toUInt8(0))
        ),
        ifNull(ca.all_cluster_ids, [])
    ), 'Array(Tuple(id UUID, name String, level UInt8))') AS cluster_details
FROM default.signal_events AS e
LEFT JOIN
(
    SELECT
        project_id,
        signal_id,
        event_id,
        arrayFilter(
            c -> dictHas('clusters_dict', (project_id, c)),
            arrayDistinct(arrayFlatten(arrayMap(
                c -> arrayPushFront(
                    dictGetOrDefault('clusters_dict', 'path', (project_id, c), []),
                    c
                ),
                groupUniqArray(cluster_id)
            )))
        ) AS all_cluster_ids
    FROM default.signal_event_summaries
    PREWHERE project_id = {project_id:UUID}
        AND (empty({signal_ids:Array(UUID)}) OR signal_id IN {signal_ids:Array(UUID)})
    GROUP BY project_id, signal_id, event_id
-- Grouped and joined on `(project_id, signal_id, event_id)`, the summaries sort
-- key's leading columns. An event belongs to exactly one signal, so carrying
-- `signal_id` through the GROUP BY splits no row -- it just stops a bare
-- `event_id` match from having to be trusted on its own.
) AS ca ON (e.project_id = ca.project_id) AND (e.signal_id = ca.signal_id) AND (e.id = ca.event_id)
WHERE e.project_id = {project_id:UUID};
