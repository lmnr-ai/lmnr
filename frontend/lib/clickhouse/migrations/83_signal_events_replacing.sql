-- Moves signal_events onto ReplacingMergeTree(updated_at, is_deleted) (LAM-2490).
--
-- The old plain MergeTree table is renamed away first, because `FINAL` on a
-- plain MergeTree is an error: renaming before anything reads with `FINAL`
-- leaves no window where those reads fail. New events land in the new table
-- right away; `scripts/copy-signal-events.ts` copies the history over on
-- frontend boot and then renames old_signal_events to old_signal_events_copied,
-- which is dropped by hand.
--
-- Same column order as before, so writers that name their columns (the Rust
-- `Row` inserts) keep working; `updated_at` and `is_deleted` are last and
-- default to a live row stamped at insert time.
--
-- Monthly partitions on `timestamp`, which is also in the sort key, so a key
-- never spans partitions. `FINAL` still dedups across partitions anyway
-- (do_not_merge_across_partitions_select_final = 0). Leave `clean_deleted_rows`
-- at its default so tombstones survive merges.

RENAME TABLE IF EXISTS signal_events TO old_signal_events;

CREATE TABLE IF NOT EXISTS signal_events
(
    id UUID,
    project_id UUID,
    signal_id UUID,
    trace_id UUID,
    run_id UUID,
    name String,
    payload String,
    timestamp DateTime64(9, 'UTC'),
    summary String CODEC(ZSTD(3)),
    severity UInt8 DEFAULT 0,
    signal_version UInt32 DEFAULT 0,
    summaries Array(String) CODEC(ZSTD(3)),
    updated_at DateTime64(9, 'UTC') DEFAULT now64(9),
    is_deleted UInt8 DEFAULT 0
)
ENGINE = ReplacingMergeTree(updated_at, is_deleted)
PARTITION BY toStartOfMonth(timestamp)
ORDER BY (project_id, signal_id, timestamp, id);

-- Bodies are verbatim from migration 75 apart from `FINAL` on signal_events.

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
FROM default.signal_events AS e FINAL
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
FROM default.signal_events AS e FINAL
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
