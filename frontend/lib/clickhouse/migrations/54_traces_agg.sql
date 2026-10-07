-- Aggregating replacement for traces_replacing (LAM-1879). Each ingest batch
-- inserts one partial row per trace; ClickHouse folds partials at merge time,
-- and reads always re-aggregate with GROUP BY. `statuses` / `trace_types` are
-- seen-value enum arrays (LAM-1983); precedence lives only in the view.
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
    -- legacy writes here, not exposed in views, kept for bookkeeping
    -- purposes and to restore any data overwritten with SET semantics
    `metadata` SimpleAggregateFunction(maxMap, Map(String, String)),
    `tags` SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `num_spans` SimpleAggregateFunction(sum, UInt64),
    `span_names` SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `cache_read_input_tokens` SimpleAggregateFunction(sum, UInt64),
    `cache_creation_input_tokens` SimpleAggregateFunction(sum, UInt64),
    `reasoning_tokens` SimpleAggregateFunction(sum, UInt64),
    `statuses` SimpleAggregateFunction(groupUniqArrayArray, Array(Enum8('success' = 1, 'error' = 2))),
    `trace_types` SimpleAggregateFunction(groupUniqArrayArray,
        Array(Enum8('DEFAULT' = 0, 'EVALUATION' = 1, 'EVENT' = 2, 'PLAYGROUND' = 3))),
    -- debug-only: insert wall-clock, folds to first-seen; not exposed in the view
    `created_at` SimpleAggregateFunction(min, DateTime64(9, 'UTC')) DEFAULT now64(9),
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

CREATE TABLE IF NOT EXISTS default.traces_static
(
    `project_id` UUID,
    `trace_id` UUID,
    `start_time` DateTime64(9, 'UTC'),
    `input` Nullable(String) CODEC(ZSTD(3)),
    `output_hashes` Nullable(String) CODEC(ZSTD(3)),
    `user_id` Nullable(String),
    `session_id` Nullable(String),
    -- SET semantics: whole stringified JSON object, written only when non-empty.
    -- Setting it more than once per trace is undefined (see the header).
    `metadata` Nullable(String) CODEC(ZSTD(3)),
    `root_span_id` Nullable(UUID),
    `root_span_name` Nullable(String),
    `root_span_name_from_path` Nullable(String),
    `root_span_type` Nullable(Enum8('DEFAULT' = 0, 'LLM' = 1, 'PIPELINE' = 2, 'EXECUTOR' = 3,
        'EVALUATOR' = 4, 'EVALUATION' = 5, 'TOOL' = 6, 'HUMAN_EVALUATOR' = 7, 'CACHED' = 8)),
    `has_browser_session` Nullable(UInt8),
    -- reserved, no writer yet; same SET semantics as `metadata`
    `internal_metadata` Nullable(String) CODEC(ZSTD(3)),
    INDEX traces_static_session_id_idx session_id TYPE bloom_filter,
    INDEX traces_static_user_id_idx user_id TYPE bloom_filter,
    PROJECTION p_start_time
    (
        SELECT *
        ORDER BY project_id, start_time, trace_id
    )
)
ENGINE = CoalescingMergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (project_id, trace_id)
SETTINGS index_granularity = 8192, deduplicate_merge_projection_mode = 'rebuild';

-- Reads MUST keep the padded-bounds contract: the caller's window is widened by
-- more than the max trace duration (the query engine already does this for
-- traces_v0), because a tight `start_time` filter can clip a trace's partials —
-- here that would drop whichever static columns only the clipped write carried.
DROP VIEW IF EXISTS default.traces_v0;
CREATE VIEW IF NOT EXISTS default.traces_v0 SQL SECURITY INVOKER AS
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
    -- no status-bearing spans resolves to 'success', matching traces_v0's two-value contract
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
    ifNull(ts.input, '') AS agent_input
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
        groupUniqArrayArray(span_names) AS span_names
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

DROP VIEW IF EXISTS default.trace_outputs_v0;
CREATE VIEW IF NOT EXISTS default.trace_outputs_v0 SQL SECURITY INVOKER AS
SELECT
    trace_id,
    arrayMap(
        h -> dictGetOrDefault('deduped_content_dict', 'content', tuple(project_id, h), ''),
        arrayMap(
            i -> unhex(substring(ifNull(output_hashes, ''), i * 64 + 1, 64)),
            range(intDiv(length(ifNull(output_hashes, '')), 64))
        )
    ) AS agent_output
FROM default.traces_static FINAL
PREWHERE project_id = {project_id:UUID}
WHERE notEmpty(ifNull(output_hashes, ''));
