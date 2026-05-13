-- LAM-1578: Structural deduplication for LLM span input message payloads.
-- Dedup is trace-scoped: same content in two different traces produces two rows.
CREATE TABLE IF NOT EXISTS llm_messages
(
    project_id UUID,
    trace_id UUID,
    message_hash FixedString(32),
    content String CODEC(ZSTD(3)),
    last_seen_at DateTime64(9, 'UTC') DEFAULT now() CODEC(DoubleDelta, LZ4)
)
ENGINE = ReplacingMergeTree(last_seen_at)
ORDER BY (project_id, trace_id, message_hash)
SETTINGS index_granularity = 8192;

ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS input_message_hashes Array(FixedString(32)) CODEC(ZSTD(3));

-- Rename `spans.span_type` (the underlying UInt8 column) to `spans.span_kind`.
-- The `spans_v0` view below exposes the multiIf projection aliased back to
-- `span_type` so external queries are unaffected.
--
-- Why: CH 25.x's analyzer fails to fully resolve the `WHERE span_type='LLM'
-- ORDER BY start_time DESC LIMIT N` predicate against `spans_v0` when the
-- view has a projection column named `span_type` AND the underlying table
-- column is also `span_type`. It auto-renames the view's projection alias
-- to a synthetic `t` and then throws `AMBIGUOUS_COLUMN_NAME: span_type
-- String / span_type UInt8` under prewhere moves. Renaming the physical
-- column breaks the tie at the table level.
--
-- Projections block `ALTER TABLE ... RENAME COLUMN` (CH errors
-- "Cannot apply mutation because it breaks projection"), so we drop the
-- projection, rename the column in both the table and the projection body,
-- and re-add the projection with the renamed column name.
ALTER TABLE spans DROP PROJECTION IF EXISTS spans_no_io_by_start_time;

ALTER TABLE spans RENAME COLUMN span_type TO span_kind;

ALTER TABLE spans ADD PROJECTION IF NOT EXISTS spans_no_io_by_start_time (
    SELECT
        span_id,
        name,
        span_kind,
        start_time,
        end_time,
        input_cost,
        output_cost,
        total_cost,
        model,
        session_id,
        project_id,
        trace_id,
        provider,
        input_tokens,
        output_tokens,
        total_tokens,
        user_id,
        path,
        size_bytes,
        status,
        attributes,
        request_model,
        response_model,
        parent_span_id,
        trace_metadata,
        trace_type,
        tags_array,
        events
    ORDER BY project_id, start_time, trace_id, span_id
);

ALTER TABLE spans MATERIALIZE PROJECTION spans_no_io_by_start_time;

-- Dictionary fronting `llm_messages` for per-row lookups from `spans_v0`.
-- Keyed by (project_id, trace_id, message_hash) so each span pays only for
-- the hashes it actually references; we do NOT aggregate all project
-- messages on every view read. `message_hash` is declared String because
-- dictionary attribute types cannot be FixedString(N) on CH 25.12
-- (UNKNOWN_TYPE at CREATE DICTIONARY); the FixedString(32) hashes from
-- spans.input_message_hashes coerce transparently at dictGetOrDefault time.
-- LIFETIME(MIN 30 MAX 60) refreshes the cache within ~1 minute so recent
-- llm_messages inserts become queryable without a full rebuild.
--
-- SOURCE omits `DB` so the dictionary resolves `llm_messages` in whatever
-- database the migration tool connects to (driven by CLICKHOUSE_DB, default
-- `default`). Hardcoding `DB 'default'` would silently break self-hosted
-- deployments that run against a non-default database: the dict would look
-- up a table that doesn't exist there and every dictGetOrDefault in
-- spans_v0 would return the 'null' fallback, replacing all reconstructed
-- LLM inputs with [null,null,...].
CREATE DICTIONARY IF NOT EXISTS llm_messages_dict
(
    project_id UUID,
    trace_id UUID,
    message_hash String,
    content String
)
PRIMARY KEY project_id, trace_id, message_hash
SOURCE(CLICKHOUSE(
    TABLE 'llm_messages'
))
LAYOUT(COMPLEX_KEY_CACHE(SIZE_IN_CELLS 131072))
LIFETIME(MIN 30 MAX 60);

-- Rebuild `spans_v0` against the renamed column. The output alias stays
-- `span_type` so downstream queries, filters, and the Python query-engine
-- registry (which lists `span_type` as an allowed column on `spans`) keep
-- working unchanged. Only the physical column changed.
--
-- Reconstruct `input` from llm_messages via dictGetOrDefault inside arrayMap.
-- Missing hashes fall back to 'null' so the concatenated array stays
-- parseable by JSON.parse on the frontend even when the dict hasn't yet
-- picked up a freshly-inserted llm_messages row (CH replication lag between
-- the llm_messages and spans inserts).
DROP VIEW IF EXISTS spans_v0;
CREATE VIEW IF NOT EXISTS spans_v0 SQL SECURITY INVOKER AS
    SELECT
        span_id,
        name,
        multiIf(
            span_kind = 0, 'DEFAULT',
            span_kind = 1, 'LLM',
            span_kind = 3, 'EXECUTOR',
            span_kind = 4, 'EVALUATOR',
            span_kind = 5, 'EVALUATION',
            span_kind = 6, 'TOOL',
            span_kind = 7, 'HUMAN_EVALUATOR',
            span_kind = 8, 'CACHED',
            'UNKNOWN'
        ) AS span_type,
        start_time,
        end_time,
        end_time - start_time AS duration,
        input_cost,
        output_cost,
        total_cost,
        input_tokens,
        output_tokens,
        total_tokens,
        request_model,
        response_model,
        model,
        trace_id,
        provider,
        path,
        if(
            notEmpty(input_message_hashes),
            '[' || arrayStringConcat(
                arrayMap(
                    h -> dictGetOrDefault(
                        'llm_messages_dict',
                        'content',
                        tuple(project_id, trace_id, h),
                        'null'
                    ),
                    input_message_hashes
                ),
                ','
            ) || ']',
            input
        ) AS input,
        output,
        multiIf(status = 'error', 'error', status = 'success', 'success', 'success') AS status,
        parent_span_id,
        attributes,
        tags_array AS tags,
        events
    FROM spans
    WHERE project_id = {project_id:UUID};

-- `evaluation_datapoints_v0` joins against spans and casts
-- `(name, duration, span_type)` into a Tuple for `trace_spans`. Rebuild it
-- with `span_kind` so it keeps compiling; external consumers don't see this
-- column name (the tuple element keeps its `type` alias).
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
    end_time - start_time duration,
    t.input_cost input_cost,
    t.output_cost output_cost,
    t.total_cost total_cost,
    t.start_time start_time,
    t.end_time end_time,
    t.input_tokens input_tokens,
    t.output_tokens output_tokens,
    t.total_tokens total_tokens,
    t.status trace_status,
    t.metadata trace_metadata,
    t.tags trace_tags,
    t.top_span_id top_span_id,
    s.spans trace_spans
FROM evaluation_datapoints edp FINAL
LEFT JOIN traces_replacing t FINAL ON (t.project_id = edp.project_id) AND (t.id = edp.trace_id)
LEFT JOIN
(
    SELECT
        trace_id,
        project_id,
        groupArray(
            CAST(
                tuple(name, duration, span_kind)
                AS
                Tuple(name String, duration Float64, type String)
            )
        ) AS spans
    FROM spans
    WHERE project_id = {project_id:UUID}
    GROUP BY project_id, trace_id
) AS s ON (s.project_id = edp.project_id) AND (s.trace_id = edp.trace_id)
WHERE edp.project_id = {project_id:UUID};
