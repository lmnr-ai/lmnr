-- Move trace aggregation from app-server into ClickHouse (LAM-2215).
--
-- Two materialized views fold every `spans` INSERT block into the existing
-- `traces_agg` / `traces_static` tables. Neither table changes shape: an MV
-- triggers on the inserted BLOCK ONLY (it never reads the target or other
-- blocks), so its output is exactly the same per-batch DELTA the app-server
-- used to write, and the same fold-from-partials contract still applies to
-- every column.
--
-- DEPLOY ORDER IS LOAD-BEARING. While an app-server that still writes its own
-- `traces_agg` partials is running, these views DOUBLE-COUNT every `sum`
-- column. ClickHouse migrations run on frontend boot and app-server rolls
-- independently, so this must ship as a two-release rollout: (1) release the
-- app-server change that stops writing span-derived partials, (2) only then
-- let this migration run. Until then, keep the file out of the applied set.
--
-- WHAT THE VIEWS DO NOT COVER. They see `spans` only, and ingestion drops
-- three classes of span before that table (`should_record_to_clickhouse`):
-- metadata-only virtual spans (`POST /v1/traces/metadata`), extracted agent io,
-- and "signal" spans (`cdp_use.session`, which is the ONLY carrier of
-- `has_browser_session`, plus skipped Claude Code `anthropic.messages` LLM
-- spans whose tokens/costs still count toward the trace). The app-server keeps
-- writing partials for exactly that residue; the two writers union cleanly
-- because both are deltas into the same folding tables.

-- Aggregates. Reads only physical columns plus `trace_metadata` (already the
-- flattened metadata object, so no `JSONExtractKeys(attributes)` scan of the
-- big attributes blob is needed). Token/cost columns are pre-gated to LLM spans
-- at ingest, so summing them is correct — summing `gen_ai.usage.*` out of
-- `attributes` instead would re-inflate totals from non-LLM spans that carry
-- stray usage attributes.
CREATE MATERIALIZED VIEW IF NOT EXISTS default.traces_agg_mv TO default.traces_agg AS
SELECT
    trace_id AS id,
    project_id,
    min(start_time) AS start_time,
    max(end_time) AS end_time,
    sum(input_tokens) AS input_tokens,
    sum(output_tokens) AS output_tokens,
    sum(total_tokens) AS total_tokens,
    sum(input_cost) AS input_cost,
    sum(output_cost) AS output_cost,
    sum(total_cost) AS total_cost,
    -- Raw JSON value per key, matching the `maxMap` column's encoding. The
    -- reserved keys are compatibility shims that carry agent io, never customer
    -- metadata; they cannot reach `spans` today, this is the backstop.
    maxMap(CAST(
        arrayMap(
            k -> (k, JSONExtractRaw(trace_metadata, k)),
            arrayFilter(k -> (k NOT IN ('lmnr_user_task', 'lmnr_trace_output')), JSONExtractKeys(trace_metadata))
        ),
        'Map(String, String)'
    )) AS metadata,
    groupUniqArrayArray(tags_array) AS tags,
    count() AS num_spans,
    -- groupUniqArray, not groupArray: the target column dedups on insert anyway
    -- (a SimpleAggregateFunction applies its function to the inserted value), so
    -- groupArray only costs a full-size intermediate on wide traces.
    groupUniqArray(name) AS span_names,
    sum(cache_read_input_tokens) AS cache_read_input_tokens,
    sum(cache_creation_input_tokens) AS cache_creation_input_tokens,
    sum(reasoning_tokens) AS reasoning_tokens,
    -- Seen-value enum arrays; precedence stays in `traces_v0`. A span with no
    -- status contributes nothing (an empty array reads back as 'success'), which
    -- is what the app-server wrote.
    groupUniqArrayIf(toInt8(if(status = 'error', 2, 1)), status != '') AS statuses,
    -- An Evaluation span (SpanType 5) types the whole trace EVALUATION, mirroring
    -- `TraceAggregation::from_spans`. The `trace_type <= 3` clamp is not
    -- defensive noise: an out-of-range Enum8 int is accepted at INSERT and then
    -- poisons every later read of the part with UNKNOWN_ELEMENT_OF_ENUM.
    groupUniqArray(toInt8(multiIf(span_type = 5, 1, trace_type <= 3, trace_type, 0))) AS trace_types
FROM default.spans
GROUP BY project_id, trace_id;

-- Set-once columns. Every payload column must be a NULL hole when this block
-- learned nothing about it, or CoalescingMergeTree's last-non-NULL-write-wins
-- clobbers what an earlier block set. `input` / `output_hashes` /
-- `internal_metadata` are absent from the SELECT on purpose — MV-to-table
-- matching is by NAME, so an omitted Nullable column lands as NULL, and those
-- three are only ever written by the app-server's agent-io path.
--
-- The per-block aggregation is a subquery so the metadata map is built once
-- instead of four times (the draft recomputed `maxMap(...)` for the emptiness
-- check, for mapKeys and for mapValues). An MV still triggers normally with the
-- source table nested one level down.
CREATE MATERIALIZED VIEW IF NOT EXISTS default.traces_static_mv TO default.traces_static AS
SELECT
    project_id,
    trace_id,
    trace_start_time AS start_time,
    if(
        empty(metadata_map),
        NULL,
        concat('{', arrayStringConcat(arrayMap((k, v) -> concat(toJSONString(k), ':', v), mapKeys(metadata_map), mapValues(metadata_map)), ','), '}')
    ) AS metadata,
    user_id,
    session_id,
    -- `parent_span_id` is a non-Nullable UUID and roots carry the nil value, so
    -- `empty()` is the root test. A block holding only child spans writes NULL
    -- for the whole root trio and lets a later block set it.
    if(root_count = 0, NULL, root_id) AS root_span_id,
    if(root_count = 0, NULL, nullIf(root_name, '')) AS root_span_name,
    -- Only when the real root is absent, so this preview column can never race
    -- the real name — readers resolve coalesce(root_span_name, ..._from_path).
    if(root_count > 0, NULL, nullIf(path_name, '')) AS root_span_name_from_path,
    if((root_count = 0) OR (root_type > 8), NULL, toInt8(root_type)) AS root_span_type,
    has_browser_session
FROM
(
    SELECT
        project_id,
        trace_id,
        -- Aliased away from `start_time` so the argMinIf ordering arguments below
        -- still resolve to the column and not to this aggregate (ILLEGAL_AGGREGATION).
        min(start_time) AS trace_start_time,
        nullIf(max(user_id), '') AS user_id,
        nullIf(max(session_id), '') AS session_id,
        maxMap(CAST(
            arrayMap(
                k -> (k, JSONExtractRaw(trace_metadata, k)),
                arrayFilter(k -> (k NOT IN ('lmnr_user_task', 'lmnr_trace_output')), JSONExtractKeys(trace_metadata))
            ),
            'Map(String, String)'
        )) AS metadata_map,
        countIf(empty(parent_span_id)) AS root_count,
        argMinIf(span_id, start_time, empty(parent_span_id)) AS root_id,
        argMinIf(name, start_time, empty(parent_span_id)) AS root_name,
        argMinIf(span_type, start_time, empty(parent_span_id)) AS root_type,
        -- `path` is the already-filtered span path joined on '.', so its first
        -- segment is the app-server's `path.first()` unless a span name itself
        -- contains a dot. Cheaper than re-parsing `lmnr.span.path` out of
        -- `attributes`, and every span in a trace carries the same path root.
        argMinIf(splitByChar('.', path)[1], start_time, path != '') AS path_name,
        -- Presence of the attribute is the signal, not its value — matching
        -- `SpanAttributes::has_browser_session`. NOTE: the span that actually
        -- carries this (`cdp_use.session`) is filtered out before `spans`, so in
        -- practice the app-server residual write is what sets this column.
        if(countIf(JSONHas(attributes, 'lmnr.internal.has_browser_session')) > 0, toUInt8(1), NULL) AS has_browser_session
    FROM default.spans
    GROUP BY project_id, trace_id
)
-- A block that learned nothing static writes no row at all; an all-NULL row is
-- pure overhead in a coalescing table. Mirrors `CHTraceStatic::has_any_value`.
WHERE (root_count > 0)
    OR isNotNull(user_id)
    OR isNotNull(session_id)
    OR notEmpty(metadata_map)
    OR (path_name != '')
    OR isNotNull(has_browser_session);
