-- Push the predicates evaluation_datapoints_v0 was missing down into its three
-- joins (LAM-2207). The exposed column surface and types are UNCHANGED; only
-- the amount of data each join touches changes.
--
-- MUST ship with the app-server change that supplies the three new params.
-- ClickHouse parameterized views cannot declare defaults, so from the moment
-- this lands every caller has to pass eval_ids/min_start_time/max_start_time.
-- The only caller is the rewriter in app-server/src/query_engine/validator.rs,
-- where the bound injection is currently gated on `table_name == TRACES_TABLE`
-- and so evaluation_datapoints receives project_id alone. The time bounds need
-- no new derivation logic -- `traces_time_bound_args` already turns a user's
-- WHERE on start_time into padded bounds, and evaluation_datapoints.start_time
-- IS the trace's start_time, so it applies unchanged. Only eval_ids needs new
-- extraction (an `evaluation_id =` / `IN (...)` conjunct, else an empty array).
--
-- Sentinels, mirroring the traces_v0 contract: an EMPTY eval_ids array means
-- "no evaluation filter", and wide min/max_start_time bounds mean "no time
-- bound". The validator emits those whenever it cannot derive a predicate from
-- the user's WHERE, so an unfiltered query reads exactly what it reads today.
-- `empty(...) OR x IN ...` constant-folds when the array is non-empty: the
-- primary-key condition comes out as a plain `evaluation_id IN <n-element set>`
-- and still prunes granules.
--
-- Why each join needed a different lever, given the key layouts:
--   evaluation_datapoints  ORDER BY (project_id, evaluation_id, id)
--   traces_agg             ORDER BY (project_id, id)  PARTITION BY toYYYYMM(start_time)
--   traces_static          ORDER BY (project_id, trace_id)  PARTITION BY toYYYYMM(start_time)
--   spans                  ORDER BY (project_id, trace_id, start_time, span_id), unpartitioned
-- `evaluation_id` is the second key column on evaluation_datapoints, so
-- pushing eval_ids into the outer scan and into all three IN subqueries prunes
-- the datapoint reads directly. traces_agg/traces_static do not carry
-- start_time in their sort key, so the bounds pay off there via partition
-- pruning plus their p_start_time projections. spans is unpartitioned, so its
-- bounds pay off via the spans_no_io_by_start_time projection
-- (ORDER BY project_id, start_time, trace_id, span_id) -- usable only because
-- this join selects no input/output columns, which that projection omits.
--
-- The spans join is the one that had no row filter at all: it grouped the whole
-- project's spans table to look up a few hundred eval traces.
--
-- Measured on a 4M-trace / 8M-span / 40-evaluation corpus, one evaluation's
-- list query (214 rows out), cumulative:
--   as shipped                       11,509,115 rows   352.8 MiB   57 ms
--   + spans trace_id filter          10,262,774 rows   315.5 MiB   58 ms
--   + eval_ids pushdown               4,428,236 rows   137.8 MiB   29 ms
--   + start_time bounds                 212,889 rows     8.6 MiB   19 ms
-- The trace_id filter alone is a wash-to-regression (a project-wide IN set
-- still touches every granule, and the extra subquery is not free) -- the three
-- only pay off together, so they ship together.
--
-- Reads MUST keep the padded-bounds contract that traces_v0 already documents:
-- the caller widens its window by more than the max trace duration, because a
-- tight start_time filter clips a trace's partials. On traces_agg that drops
-- whichever spans landed outside the window; on traces_static it drops
-- whichever set-once columns only the clipped write carried.
--
-- `trace_spans` element order changes, and was never stable: groupArray has no
-- ORDER BY, so the order follows the order the spans rows were read in, which
-- the new trace_id filter alters. Verified over a whole project that contents
-- are bit-identical -- same element count, same hash under arraySort -- and
-- nothing in the codebase reads the order (the column is only exposed to user
-- SQL via query_engine/schema.rs). Parity checks on this view must sort before
-- comparing. Making the order a guarantee is a separate change, and would mean
-- sorting inside the aggregate rather than trusting read order.
DROP VIEW IF EXISTS evaluation_datapoints_v0;
CREATE VIEW IF NOT EXISTS evaluation_datapoints_v0
SQL SECURITY INVOKER
AS SELECT
    edp.id id,
    edp.evaluation_id evaluation_id,
    edp.data data,
    edp.target target,
    edp.metadata metadata,
    edp.executor_output executor_output,
    edp.index `index`,
    edp.trace_id trace_id,
    edp.group_id group_id,
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
    -- no status-bearing span resolves to 'success', matching traces_v0.
    -- LowCardinality keeps the column type identical to the previous view.
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
        -- cast off the SimpleAggregateFunction wrapper the aggregates carry, so
        -- the exposed column types stay plain DateTime64 as before
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
        -- the filters live in a nested scan with an explicit column list: a bare
        -- `start_time` in the outer WHERE would bind to the `min(start_time)`
        -- alias above and fail as an aggregate in WHERE, and `SELECT *` here
        -- would read every traces_agg column instead of the twelve we fold
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
