-- Live Postgres entity definitions via the `pg` PostgreSQL database engine.
-- ClickHouse stores nothing; every SELECT hits Postgres. The `pg` database is
-- created at boot (frontend/lib/clickhouse/postgres-engine.ts) from env vars,
-- not here — a SQL migration cannot interpolate credentials, and putting them
-- in this file would trip the checksum guard on rotation.
--
-- Do NOT query `pg.*` from the query API. The engine mirrors the whole
-- schema; these views are the allowlist. Explicit columns so a new Postgres
-- column never leaks. SQL SECURITY DEFINER so the query-API user can SELECT
-- the view without SELECT on `pg`.

-- `prompt`, `structured_output_schema` and `metadata` are unbounded text/jsonb.
-- Safe to expose because ClickHouse prunes unselected columns out of the query
-- it sends Postgres, and `signals` is a handful of rows per project.
DROP VIEW IF EXISTS signals_v0;
CREATE VIEW signals_v0
SQL SECURITY DEFINER
AS SELECT
    id,
    name,
    prompt,
    structured_output_schema,
    metadata,
    llm_model,
    created_at,
    version
FROM pg.signals
WHERE project_id = {project_id:UUID};

-- Entity names (and evaluations.group_id) come from Postgres through the
-- `signals_dict` / `evaluations_dict` / `datasets_dict` dictionaries, created at
-- boot over `pg.*` (postgres-engine.ts). A dictGet column is pruned when not
-- selected, so the views below only touch the dictionaries -- and only fail
-- when `pg` is unreachable -- for queries that read these columns.
-- `signal_events.name` is an alias of `signal_name` for old queries; the
-- stored `name` column (a write-time snapshot) is no longer read.
-- Bodies below are verbatim from migrations 65, 63 and 7 plus those columns.

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

DROP VIEW IF EXISTS evaluation_datapoints_v0;
CREATE VIEW IF NOT EXISTS evaluation_datapoints_v0
SQL SECURITY INVOKER
AS SELECT
    edp.id id,
    edp.evaluation_id evaluation_id,
    dictGetOrDefault('evaluations_dict', 'name', (edp.project_id, edp.evaluation_id), '') evaluation_name,
    edp.data data,
    edp.target target,
    edp.metadata metadata,
    edp.executor_output executor_output,
    edp.index `index`,
    edp.trace_id trace_id,
    -- Postgres is the source of truth; the ClickHouse copy covers the dict's reload lag.
    dictGetOrDefault('evaluations_dict', 'group_id', (edp.project_id, edp.evaluation_id), edp.group_id) group_id,
    edp.scores scores,
    edp.updated_at updated_at,
    edp.updated_at created_at,
    edp.dataset_id dataset_id,
    edp.dataset_datapoint_id dataset_datapoint_id,
    edp.dataset_datapoint_created_at dataset_datapoint_created_at,
    t.end_time - t.start_time duration,
    t.input_cost input_cost,
    t.output_cost output_cost,
    t.total_cost total_cost,
    t.start_time start_time,
    t.end_time end_time,
    t.input_tokens input_tokens,
    t.output_tokens output_tokens,
    t.total_tokens total_tokens,
    -- No status-bearing span means 'success', as in traces_v0; toLowCardinality
    -- preserves the previous column type.
    toLowCardinality(if(has(t.statuses, 'error'), 'error', 'success')) trace_status,
    ifNull(ts.metadata, '') trace_metadata,
    t.tags trace_tags,
    ifNull(ts.root_span_id, toUUID('00000000-0000-0000-0000-000000000000')) top_span_id,
    s.spans trace_spans
FROM evaluation_datapoints edp FINAL
LEFT JOIN
(
    SELECT
        project_id,
        id,
        -- Cast off the SimpleAggregateFunction wrapper so the exposed types
        -- stay plain DateTime64 as before
        CAST(min(start_time) AS DateTime64(9, 'UTC')) AS start_time,
        CAST(max(end_time) AS DateTime64(9, 'UTC')) AS end_time,
        sum(input_tokens) AS input_tokens,
        sum(output_tokens) AS output_tokens,
        sum(total_tokens) AS total_tokens,
        sum(input_cost) AS input_cost,
        sum(output_cost) AS output_cost,
        sum(total_cost) AS total_cost,
        groupUniqArrayArray(statuses) AS statuses,
        groupUniqArrayArray(tags) AS tags
    FROM
    (
        -- Nested scan because a bare `start_time` in the outer WHERE would bind
        -- to the `min(start_time)` alias above and fail as an aggregate in WHERE
        SELECT
            project_id,
            id,
            start_time,
            end_time,
            input_tokens,
            output_tokens,
            total_tokens,
            input_cost,
            output_cost,
            total_cost,
            statuses,
            tags
        FROM default.traces_agg
        WHERE project_id = {project_id:UUID}
            AND start_time >= {min_start_time:DateTime64(9)}
            AND start_time <= {max_start_time:DateTime64(9)}
            AND id IN (
                SELECT trace_id
                FROM default.evaluation_datapoints
                WHERE project_id = {project_id:UUID}
                    AND (empty({eval_ids:Array(UUID)})
                        OR evaluation_id IN {eval_ids:Array(UUID)})
            )
    )
    GROUP BY project_id, id
) AS t ON (t.project_id = edp.project_id) AND (t.id = edp.trace_id)
LEFT JOIN
(
    SELECT project_id, trace_id, metadata, root_span_id
    FROM default.traces_static FINAL
    PREWHERE project_id = {project_id:UUID}
        AND start_time >= {min_start_time:DateTime64(9)}
        AND start_time <= {max_start_time:DateTime64(9)}
        AND trace_id IN (
            SELECT trace_id
            FROM default.evaluation_datapoints
            WHERE project_id = {project_id:UUID}
                AND (empty({eval_ids:Array(UUID)})
                    OR evaluation_id IN {eval_ids:Array(UUID)})
        )
) AS ts ON (ts.project_id = edp.project_id) AND (ts.trace_id = edp.trace_id)
LEFT JOIN
(
    SELECT
        trace_id,
        project_id,
        groupArray(
            CAST(
                tuple(
                    name,
                    (toUnixTimestamp64Nano(end_time) - toUnixTimestamp64Nano(start_time)) / 1000000000,
                    span_type
                )
                AS
                Tuple(name String, duration Float64, type String)
            )
        ) AS spans
    FROM default.spans
    WHERE project_id = {project_id:UUID}
        AND start_time >= {min_start_time:DateTime64(9)}
        AND start_time <= {max_start_time:DateTime64(9)}
        AND trace_id IN (
            SELECT trace_id
            FROM default.evaluation_datapoints
            WHERE project_id = {project_id:UUID}
                AND (empty({eval_ids:Array(UUID)})
                    OR evaluation_id IN {eval_ids:Array(UUID)})
        )
    GROUP BY project_id, trace_id
) AS s ON (s.project_id = edp.project_id) AND (s.trace_id = edp.trace_id)
WHERE edp.project_id = {project_id:UUID}
    AND (empty({eval_ids:Array(UUID)}) OR edp.evaluation_id IN {eval_ids:Array(UUID)});

DROP VIEW IF EXISTS dataset_datapoints_v0;
CREATE VIEW dataset_datapoints_v0 SQL SECURITY INVOKER AS
    SELECT
        id,
        created_at,
        dataset_id,
        dictGetOrDefault('datasets_dict', 'name', (project_id, dataset_id), '') AS dataset_name,
        data,
        target,
        metadata
    FROM dataset_datapoints
    WHERE project_id={project_id:UUID}
    QUALIFY ROW_NUMBER() OVER (PARTITION BY project_id, dataset_id, id ORDER BY created_at DESC) = 1;

DROP VIEW IF EXISTS dataset_datapoint_versions_v0;
CREATE VIEW dataset_datapoint_versions_v0 SQL SECURITY INVOKER AS
    SELECT
        id,
        created_at,
        dataset_id,
        dictGetOrDefault('datasets_dict', 'name', (project_id, dataset_id), '') AS dataset_name,
        data,
        target,
        metadata
    FROM dataset_datapoints
    WHERE project_id={project_id:UUID};
