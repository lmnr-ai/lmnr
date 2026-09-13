-- Flatten signal-event / cluster reads onto traces_agg and leaf-only membership
-- (LAM-2207 package C). DDL only -- data movement is backfill-signal-clusters.ts,
-- which self-hosted runs automatically on startup.
--
-- The arrays concatenate across a trace's partials, so each write contributes
-- only its own batch's delta. Codec choice and sizing are in
-- docs/internal/clickhouse-traces.md.

ALTER TABLE traces_agg ADD COLUMN IF NOT EXISTS signal_events
    SimpleAggregateFunction(groupArrayArray, Array(Tuple(
        event_id UUID,
        signal_id UUID,
        severity UInt8,
        payload String
    ))) CODEC(ZSTD(3));

ALTER TABLE traces_agg ADD COLUMN IF NOT EXISTS cluster_ids
    SimpleAggregateFunction(groupUniqArrayArray, Array(UUID)) CODEC(ZSTD(3));

CREATE TABLE IF NOT EXISTS signal_event_summaries
(
    project_id UUID,
    signal_id UUID,
    cluster_id UUID,
    event_id UUID,
    summary String,
    trace_id UUID,
    trace_start_time DateTime64(9, 'UTC'),
    created_at DateTime64(9, 'UTC') DEFAULT now64(9)
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (project_id, signal_id, cluster_id, event_id, cityHash64(summary))
SETTINGS index_granularity = 8192;

-- The cluster hierarchy is stored ONLY as `signal_event_clusters.parent_id`.
-- Nothing derived from it is materialized -- no `path` array, no (ancestor,
-- descendant) closure, no adjacency-list side table. Each of those is transitive
-- state that a mid-tree node gaining a parent would force a rewrite of, and each
-- has to be kept in step with the column it duplicates.
--
-- Ancestors (upward) come from `clusters_dict`, whose source query walks
-- `parent_id` recursively at load time and exposes the chain as a `path`
-- attribute, so readers pay for it once per dict reload rather than per query.
-- Descendants (downward) are a `WITH RECURSIVE` walk over `parent_id` itself.
--
-- Measured on 26.5 against a synthetic 104k-cluster signal (bigger than today's
-- largest), resolving every descendant of a level-2 node: 20.4ms median. A
-- dedicated reverse-index table got that to 14.4ms -- not worth a second table,
-- a backfill step and a write path for ~6ms, given signals stay under ~10k.
-- A bloom_filter on `parent_id` was also measured and rejected: it does prune
-- (13 -> 2 granules) but came out SLOWER (30.1ms), because at ~1.6 MB the index
-- lookup costs more than the scan it saves. Revisit both if a signal approaches
-- ~1M clusters, where cost-tracks-the-answer starts to beat cost-tracks-the-table.
--
-- The downward walk must run WITHOUT `FINAL` (that alone is 31.2ms -> 20.4ms) and
-- with `DISTINCT`. Safe because `parent_id` only ever transitions `None ->
-- Some(_)`, once, in `assign_parent_to_child`: a superseded row version can only
-- carry the NIL parent, which simply fails to match, so a stale version can never
-- produce a wrong edge -- only a duplicate of a correct one, which `DISTINCT`
-- absorbs. If re-parenting is ever introduced, that walk needs `FINAL` again.

DROP VIEW IF EXISTS traces_v0;
CREATE VIEW IF NOT EXISTS traces_v0 SQL SECURITY INVOKER AS
SELECT
    t.start_time AS start_time,
    t.end_time AS end_time,
    t.input_tokens AS input_tokens,
    t.output_tokens AS output_tokens,
    t.total_tokens AS total_tokens,
    t.cache_read_input_tokens AS cache_read_input_tokens,
    t.cache_creation_input_tokens AS cache_creation_input_tokens,
    t.reasoning_tokens AS reasoning_tokens,
    t.input_cost AS input_cost,
    t.output_cost AS output_cost,
    t.total_cost AS total_cost,
    (toUnixTimestamp64Nano(t.end_time) - toUnixTimestamp64Nano(t.start_time)) / 1000000000 AS duration,
    ifNull(ts.metadata, '') AS metadata,
    ifNull(ts.session_id, '') AS session_id,
    ifNull(ts.user_id, '') AS user_id,
    if(has(t.statuses, 'error'), 'error', 'success') AS status,
    ifNull(ts.root_span_id, toUUID('00000000-0000-0000-0000-000000000000')) AS top_span_id,
    ifNull(coalesce(ts.root_span_name, ts.root_span_name_from_path), '') AS top_span_name,
    CASE
        WHEN ts.root_span_type IS NULL THEN 'DEFAULT'
        WHEN ts.root_span_type = 'DEFAULT' THEN 'DEFAULT'
        WHEN ts.root_span_type = 'LLM' THEN 'LLM'
        WHEN ts.root_span_type = 'EXECUTOR' THEN 'EXECUTOR'
        WHEN ts.root_span_type = 'EVALUATOR' THEN 'EVALUATOR'
        WHEN ts.root_span_type = 'EVALUATION' THEN 'EVALUATION'
        WHEN ts.root_span_type = 'TOOL' THEN 'TOOL'
        WHEN ts.root_span_type = 'HUMAN_EVALUATOR' THEN 'HUMAN_EVALUATOR'
        WHEN ts.root_span_type = 'CACHED' THEN 'CACHED'
        ELSE 'UNKNOWN'
    END AS top_span_type,
    multiIf(
        has(t.trace_types, 'PLAYGROUND'), 'PLAYGROUND',
        has(t.trace_types, 'EVALUATION'), 'EVALUATION',
        'DEFAULT'
    ) AS trace_type,
    t.tags AS tags,
    tt.tags AS trace_tags,
    toBool(ifNull(ts.has_browser_session, 0)) AS has_browser_session,
    t.id AS id,
    t.span_names AS span_names,
    ifNull(ts.internal_metadata, '') AS internal_metadata,
    ifNull(ts.input, '') AS agent_input,
    -- Unsorted, and with no derived signal_ids/signal_severities, on purpose:
    -- an arraySort or a derived column here reads every tuple element including
    -- payload. See docs/internal/clickhouse-traces.md.
    t.signal_events AS signal_events,
    -- The CAST is what names the tuple elements: aliases inside tuple() are
    -- dropped, leaving positional .1/.2 access.
    CAST(arrayMap(
        cluster_id -> tuple(
            cluster_id,
            dictGetOrDefault('clusters_dict', 'signal_id', (t.project_id, cluster_id), toUUID('00000000-0000-0000-0000-000000000000')),
            dictGetOrDefault('clusters_dict', 'name', (t.project_id, cluster_id), ''),
            dictGetOrDefault('clusters_dict', 'level', (t.project_id, cluster_id), toUInt8(0)),
            dictGetOrDefault('clusters_dict', 'parent_id', (t.project_id, cluster_id), toUUID('00000000-0000-0000-0000-000000000000')),
            dictGetOrDefault('clusters_dict', 'num_signal_events', (t.project_id, cluster_id), toUInt32(0)),
            dictGetOrDefault('clusters_dict', 'created_at', (t.project_id, cluster_id), toDateTime64(0, 9, 'UTC')),
            dictGetOrDefault('clusters_dict', 'updated_at', (t.project_id, cluster_id), toDateTime64(0, 9, 'UTC'))
        ),
        -- `path` stays INTERNAL: it is what turns the trace's leaf-only
        -- `cluster_ids` into leaf + ancestors. It is deliberately not a field of
        -- the tuple below -- callers get the ancestors as their own elements of
        -- `clusters`, and `parent_id` is enough to walk the hierarchy from there.
        arrayFilter(
            leaf_or_ancestor_id -> dictHas('clusters_dict', (t.project_id, leaf_or_ancestor_id)),
            arrayDistinct(arrayFlatten(arrayMap(
                leaf_id -> arrayPushFront(
                    dictGetOrDefault('clusters_dict', 'path', (t.project_id, leaf_id), []),
                    leaf_id
                ),
                t.cluster_ids
            )))
        )
    ) AS Array(Tuple(
        id UUID,
        signal_id UUID,
        name String,
        level UInt8,
        parent_id UUID,
        num_signal_events UInt32,
        created_at DateTime64(9, 'UTC'),
        updated_at DateTime64(9, 'UTC')
    ))) AS clusters
FROM (
    SELECT
        project_id,
        id,
        min(start_time) AS start_time,
        max(end_time) AS end_time,
        sum(input_tokens) AS input_tokens,
        sum(output_tokens) AS output_tokens,
        sum(total_tokens) AS total_tokens,
        sum(cache_read_input_tokens) AS cache_read_input_tokens,
        sum(cache_creation_input_tokens) AS cache_creation_input_tokens,
        sum(reasoning_tokens) AS reasoning_tokens,
        sum(input_cost) AS input_cost,
        sum(output_cost) AS output_cost,
        sum(total_cost) AS total_cost,
        groupUniqArrayArray(statuses) AS statuses,
        groupUniqArrayArray(trace_types) AS trace_types,
        groupUniqArrayArray(tags) AS tags,
        groupUniqArrayArray(span_names) AS span_names,
        groupArrayArray(signal_events) AS signal_events,
        groupUniqArrayArray(cluster_ids) AS cluster_ids
    FROM (
        -- SELECT * cannot be flattened away: min(start_time) below aliases
        -- start_time, which would then resolve inside this WHERE.
        SELECT *
        FROM default.traces_agg
        WHERE project_id = {project_id:UUID}
            AND start_time >= {min_start_time:DateTime64(9)}
            AND start_time <= {max_start_time:DateTime64(9)}
    )
    GROUP BY project_id, id
) AS t
LEFT JOIN (
    SELECT * FROM default.trace_tags FINAL WHERE project_id = {project_id:UUID}
) AS tt
    ON t.project_id = tt.project_id AND t.id = tt.trace_id
LEFT JOIN (
    SELECT *
    FROM default.traces_static FINAL
    PREWHERE project_id = {project_id:UUID}
        AND start_time >= {min_start_time:DateTime64(9)}
        AND start_time <= {max_start_time:DateTime64(9)}
) AS ts
    ON t.project_id = ts.project_id AND t.id = ts.trace_id
WHERE t.start_time >= {min_start_time:DateTime64(9)}
    AND t.start_time <= {max_start_time:DateTime64(9)};

-- `signal_events_v0`, `signal_events_all_v0`, `event_clusters_all_v0`, and
-- `clusters_v0` all take a `signal_ids: Array(UUID)` argument, derived by the
-- query-engine validator from the caller's WHERE (same empty-array "no filter"
-- sentinel as `eval_ids` on evaluation_datapoints_v0). The first three narrow
-- their internal `signal_event_summaries` scan via that table's
-- (project_id, signal_id, ...) sort key. `clusters_v0` pushes it straight into
-- its own PREWHERE against `signal_event_clusters`, whose sort key is the same
-- shape. Either way: read only the caller's signal(s) instead of every signal in
-- the project.
DROP VIEW IF EXISTS default.signal_events_v0;
CREATE VIEW signal_events_v0
SQL SECURITY INVOKER
AS
SELECT
    e.id AS id,
    e.project_id AS project_id,
    e.signal_id AS signal_id,
    e.trace_id AS trace_id,
    e.run_id AS run_id,
    e.name AS name,
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
    arrayMap(
        c -> tuple(
            c,
            dictGetOrDefault('clusters_dict', 'name', (e.project_id, c), ''),
            dictGetOrDefault('clusters_dict', 'level', (e.project_id, c), toUInt8(0))
        ),
        arrayFilter(
            c -> dictGetOrDefault('clusters_dict', 'level', (e.project_id, c), toUInt8(0)) >= 1,
            ifNull(ca.all_cluster_ids, [])
        )
    ) AS cluster_details
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
    e.trace_id AS trace_id,
    e.run_id AS run_id,
    e.name AS name,
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
    arrayMap(
        c -> tuple(
            c,
            dictGetOrDefault('clusters_dict', 'name', (e.project_id, c), ''),
            dictGetOrDefault('clusters_dict', 'level', (e.project_id, c), toUInt8(0))
        ),
        ifNull(ca.all_cluster_ids, [])
    ) AS cluster_details
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

DROP VIEW IF EXISTS event_clusters_all_v0;
CREATE VIEW IF NOT EXISTS event_clusters_all_v0
SQL SECURITY INVOKER
AS
SELECT
    event_id,
    cluster_id,
    dictGetOrDefault('clusters_dict', 'signal_id', (project_id, cluster_id), toUUID('00000000-0000-0000-0000-000000000000')) AS signal_id,
    dictGetOrDefault('clusters_dict', 'level', (project_id, cluster_id), toUInt8(0)) AS level,
    dictGetOrDefault('clusters_dict', 'name', (project_id, cluster_id), '') AS cluster_name,
    dictGetOrDefault('clusters_dict', 'parent_id', (project_id, cluster_id), toUUID('00000000-0000-0000-0000-000000000000')) AS parent_id,
    dictGetOrDefault('clusters_dict', 'num_signal_events', (project_id, cluster_id), toUInt32(0)) AS num_signal_events,
    dictGetOrDefault('clusters_dict', 'num_children_clusters', (project_id, cluster_id), toUInt16(0)) AS num_children_clusters,
    dictGetOrDefault('clusters_dict', 'created_at', (project_id, cluster_id), toDateTime64(0, 9, 'UTC')) AS created_at,
    dictGetOrDefault('clusters_dict', 'updated_at', (project_id, cluster_id), toDateTime64(0, 9, 'UTC')) AS updated_at
FROM
(
    SELECT
        project_id,
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
    GROUP BY project_id, event_id
) ARRAY JOIN all_cluster_ids AS cluster_id;

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
    AND (empty({signal_ids:Array(UUID)}) OR signal_id IN {signal_ids:Array(UUID)})
WHERE level > 0;
