-- Resolution is by INSERTION ORDER (last non-NULL write per column wins), NOT
-- by `start_time` — CoalescingMergeTree takes no version parameter (its
-- optional argument is a columns-to-coalesce list, SummingMergeTree-style).
--
-- `metadata` has SET semantics, NOT patch semantics. It is a plain
-- Nullable(String) holding the whole stringified JSON object (same shape as
-- traces_replacing.metadata), written ONLY when a batch actually carries
-- metadata, and left NULL otherwise. Deliberately NOT a
-- SimpleAggregateFunction(maxMap, Map(...)) like traces_agg: per-key map merging
-- is slow at scale, and escaping that cost is one of the main reasons this table
-- is split out in the first place.
--
-- KNOWN CAVEAT, opted into for that performance win: because writes are deltas
-- and coalescing is "last non-NULL wins" by insertion order, **a trace whose
-- metadata is set more than once has UNDEFINED metadata** — whichever write
-- lands last wins, and keys from the other writes are lost, not merged. Any
-- single write wins wholesale. In practice metadata is set once per trace (the
-- SDK sends it with the trace, and POST /v1/traces/metadata is a set, not a
-- patch), so treat multi-write metadata as unsupported rather than merged.
--
-- `start_time` is the batch's min span start, mirroring traces_replacing /
-- traces_agg so reads can push a PREWHERE down to it.
--
-- `root_span_name` vs `root_span_name_from_path`: the real root span's name and
-- the span-path-derived preview name are SEPARATE columns, and the read path
-- resolves `coalesce(root_span_name, root_span_name_from_path)`. The fallback
-- exists to preview in-progress traces (and traces whose root span never
-- arrives).
--
-- Projections on a CoalescingMergeTree require
-- `deduplicate_merge_projection_mode = 'rebuild'` (the default `throw` refuses
-- the CREATE), same as traces_agg.
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

DROP VIEW IF EXISTS default.traces_agg_v0;

-- Read side: swap the `trace_agent_input` LEFT JOIN for a `traces_static` one, so
-- the static columns come from this table instead of traces_agg. Not yet a
-- cutover — the columns each view exposes are unchanged, so nothing downstream
-- (query-engine registry, frontend, SQL editor) has to change; this only moves
-- WHERE the values are read from.
--
-- The joined subquery is `traces_static FINAL` with the SAME project_id +
-- start_time predicates pushed down as a PREWHERE. That's what makes the join
-- affordable.
--
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
