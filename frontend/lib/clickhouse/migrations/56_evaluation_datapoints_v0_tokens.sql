-- Surface cache-read / cache-creation / reasoning tokens on
-- evaluation_datapoints_v0 (LAM-2062) so the evaluation page can show a real
-- cost + token breakdown aggregated over an eval's datapoints. traces_agg
-- already carries all three as SimpleAggregateFunction(sum, UInt64); this only
-- adds them to the existing GROUP BY and exposes them. Everything else is a
-- verbatim carry-over of migration 55 — see its header for the two type traps
-- (SimpleAggregateFunction wrappers leaking into the exposed types, and
-- trace_spans.duration needing an explicit expression).
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
    t.cache_read_input_tokens cache_read_input_tokens,
    t.cache_creation_input_tokens cache_creation_input_tokens,
    t.reasoning_tokens reasoning_tokens,
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
        sum(cache_read_input_tokens) AS cache_read_input_tokens,
        sum(cache_creation_input_tokens) AS cache_creation_input_tokens,
        sum(reasoning_tokens) AS reasoning_tokens,
        sum(input_cost) AS input_cost,
        sum(output_cost) AS output_cost,
        sum(total_cost) AS total_cost,
        groupUniqArrayArray(statuses) AS statuses,
        groupUniqArrayArray(tags) AS tags
    FROM default.traces_agg
    WHERE project_id = {project_id:UUID}
        AND id IN (SELECT trace_id FROM default.evaluation_datapoints WHERE project_id = {project_id:UUID})
    GROUP BY project_id, id
) AS t ON (t.project_id = edp.project_id) AND (t.id = edp.trace_id)
LEFT JOIN
(
    SELECT project_id, trace_id, metadata, root_span_id
    FROM default.traces_static FINAL
    PREWHERE project_id = {project_id:UUID}
        AND trace_id IN (SELECT trace_id FROM default.evaluation_datapoints WHERE project_id = {project_id:UUID})
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
    FROM spans
    WHERE project_id = {project_id:UUID}
    GROUP BY project_id, trace_id
) AS s ON (s.project_id = edp.project_id) AND (s.trace_id = edp.trace_id)
WHERE edp.project_id = {project_id:UUID};
