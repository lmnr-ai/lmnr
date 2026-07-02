-- Aggregating replacement for traces_replacing (LAM-1879). Each ingest batch
-- inserts one partial row per trace; ClickHouse folds partials at merge time,
-- and reads always re-aggregate with GROUP BY (never FINAL, so the projection
-- stays usable). `metadata` values are encoded as
-- `<20-digit zero-padded version_ns>|<raw JSON value>` so maxMap yields
-- per-key last-write-wins. `status_seen` / `trace_type_seen` are groupBitOr
-- bitmasks (bit N = value N observed); precedence lives only in the view.
CREATE TABLE IF NOT EXISTS default.traces_agg
(
    `id` UUID,
    `project_id` UUID,
    `start_time` SimpleAggregateFunction(min, DateTime64(9, 'UTC')),
    `end_time` SimpleAggregateFunction(max, DateTime64(9, 'UTC')),
    `input_tokens` SimpleAggregateFunction(sum, Int64),
    `output_tokens` SimpleAggregateFunction(sum, Int64),
    `total_tokens` SimpleAggregateFunction(sum, Int64),
    `input_cost` SimpleAggregateFunction(sum, Float64),
    `output_cost` SimpleAggregateFunction(sum, Float64),
    `total_cost` SimpleAggregateFunction(sum, Float64),
    `metadata` SimpleAggregateFunction(maxMap, Map(String, String)),
    `session_id` SimpleAggregateFunction(max, String),
    `user_id` SimpleAggregateFunction(max, String),
    `status_seen` SimpleAggregateFunction(groupBitOr, UInt64),
    `top_span_id` SimpleAggregateFunction(max, UUID),
    `top_span_name` SimpleAggregateFunction(max, String),
    `top_span_type` SimpleAggregateFunction(max, UInt8),
    `trace_type_seen` SimpleAggregateFunction(groupBitOr, UInt64),
    `tags` SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `num_spans` SimpleAggregateFunction(sum, UInt64),
    `has_browser_session` SimpleAggregateFunction(max, UInt8),
    `span_names` SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `root_span_input` SimpleAggregateFunction(max, String),
    `root_span_output` SimpleAggregateFunction(max, String),
    `cache_read_input_tokens` SimpleAggregateFunction(sum, UInt64),
    `cache_creation_input_tokens` SimpleAggregateFunction(sum, UInt64),
    `reasoning_tokens` SimpleAggregateFunction(sum, UInt64),
    PROJECTION p_start_time
    (
        SELECT *
        ORDER BY project_id, start_time, id
    )
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(start_time)
ORDER BY (project_id, id)
SETTINGS index_granularity = 8192, deduplicate_merge_projection_mode = 'rebuild';

-- Time-bound params are load-bearing for correctness, not just pruning: the
-- inner scan must include every partial of a qualifying trace, and the outer
-- re-filter on aggregated min(start_time) drops boundary traces whose partial
-- set was clipped. Callers (query engine) pad the bounds by more than the max
-- trace duration and re-apply the exact user bounds in their own WHERE.
DROP VIEW IF EXISTS default.traces_agg_v0;
CREATE VIEW IF NOT EXISTS default.traces_agg_v0 SQL SECURITY INVOKER AS
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
    if(
        length(mapKeys(t.metadata_state)) = 0,
        '',
        concat(
            '{',
            arrayStringConcat(
                arrayMap(
                    kv -> concat(toJSONString(kv.1), ':', substring(kv.2, 22)),
                    arrayZip(mapKeys(t.metadata_state), mapValues(t.metadata_state))
                ),
                ','
            ),
            '}'
        )
    ) AS metadata,
    t.session_id AS session_id,
    t.user_id AS user_id,
    if(bitAnd(t.status_seen, 2) != 0, 'error', 'success') AS status,
    t.top_span_id AS top_span_id,
    t.top_span_name AS top_span_name,
    CASE
        WHEN t.top_span_type = 0 THEN 'DEFAULT'
        WHEN t.top_span_type = 1 THEN 'LLM'
        WHEN t.top_span_type = 3 THEN 'EXECUTOR'
        WHEN t.top_span_type = 4 THEN 'EVALUATOR'
        WHEN t.top_span_type = 5 THEN 'EVALUATION'
        WHEN t.top_span_type = 6 THEN 'TOOL'
        WHEN t.top_span_type = 7 THEN 'HUMAN_EVALUATOR'
        WHEN t.top_span_type = 8 THEN 'CACHED'
        ELSE 'UNKNOWN'
    END AS top_span_type,
    multiIf(
        bitAnd(t.trace_type_seen, 8) != 0, 'PLAYGROUND',
        bitAnd(t.trace_type_seen, 2) != 0, 'EVALUATION',
        'DEFAULT'
    ) AS trace_type,
    t.tags AS tags,
    tt.tags AS trace_tags,
    toBool(t.has_browser_session) AS has_browser_session,
    t.id AS id,
    t.span_names AS span_names,
    t.root_span_input AS root_span_input,
    t.root_span_output AS root_span_output
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
        maxMap(metadata) AS metadata_state,
        max(session_id) AS session_id,
        max(user_id) AS user_id,
        groupBitOr(status_seen) AS status_seen,
        max(top_span_id) AS top_span_id,
        max(top_span_name) AS top_span_name,
        max(top_span_type) AS top_span_type,
        groupBitOr(trace_type_seen) AS trace_type_seen,
        groupUniqArrayArray(tags) AS tags,
        max(has_browser_session) AS has_browser_session,
        groupUniqArrayArray(span_names) AS span_names,
        max(root_span_input) AS root_span_input,
        max(root_span_output) AS root_span_output
    FROM (
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
WHERE t.start_time >= {min_start_time:DateTime64(9)}
    AND t.start_time <= {max_start_time:DateTime64(9)};
