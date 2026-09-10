-- Push evaluation_datapoints_v0's missing predicates down into its three joins
-- (LAM-2207). The exposed column surface and types are UNCHANGED.
--
-- MUST ship with the app-server change that supplies the three new params:
-- ClickHouse parameterized views cannot declare defaults, so from the moment
-- this lands every caller has to pass eval_ids/min_start_time/max_start_time.
-- The only caller is the rewriter in app-server/src/query_engine/validator.rs.
--
-- Sentinels mirror the traces_v0 contract: an EMPTY eval_ids means "no
-- evaluation filter", wide min/max_start_time mean "no time bound". The
-- validator emits those whenever it cannot derive a predicate from the user's
-- WHERE, so an unfiltered query reads exactly what it reads today.
--
-- Reads MUST keep the padded-bounds contract traces_v0 already documents: the
-- caller widens its window by more than the max trace duration, because a tight
-- start_time filter clips a trace's partials -- dropping the spans that landed
-- outside the window on traces_agg, and set-once columns on traces_static.
--
-- `trace_spans` element order changes, and was never stable: groupArray has no
-- ORDER BY, so the order follows read order, which the new trace_id filter
-- alters. Contents are unchanged (verified bit-identical under arraySort) and
-- nothing reads the order, but parity checks on this view must sort first.
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
