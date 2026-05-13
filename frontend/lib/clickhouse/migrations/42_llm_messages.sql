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

-- Dictionary fronting `llm_messages` for per-row lookups from `spans_v0`.
-- Keyed by (project_id, trace_id, message_hash) so each span pays only for
-- the hashes it actually references; we do NOT aggregate all project
-- messages on every view read. `message_hash` is declared String because
-- dictionary attribute types cannot be FixedString(N) on CH 25.12
-- (UNKNOWN_TYPE at CREATE DICTIONARY); the FixedString(32) hashes from
-- spans.input_message_hashes coerce transparently at dictGetOrDefault time.
-- LIFETIME(MIN 30 MAX 60) refreshes the cache within ~1 minute so recent
-- llm_messages inserts become queryable without a full rebuild.
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
    DB 'default'
))
LAYOUT(COMPLEX_KEY_CACHE(SIZE_IN_CELLS 131072))
LIFETIME(MIN 30 MAX 60);

-- Reconstruct `input` from llm_messages via dictGetOrDefault inside arrayMap.
-- Missing hashes fall back to 'null' so the concatenated array stays
-- parseable by JSON.parse on the frontend even when the dict hasn't yet
-- picked up a freshly-inserted llm_messages row (CH replication lag between
-- the llm_messages and spans inserts).
--
-- SETTINGS optimize_move_to_prewhere = 0 works around a CH 25.12 analyzer
-- bug: a query like `SELECT * FROM spans_v0(...) WHERE span_type = 'LLM'
-- ORDER BY start_time DESC` fails with AMBIGUOUS_COLUMN_NAME because the
-- prewhere mover pushes the String predicate on the CASE-aliased
-- `span_type` down onto the base UInt8 `spans.span_type` column with the
-- same name. The bug reproduces whenever the view body contains an
-- arrayMap over a base-table array column; disabling the prewhere move
-- makes CH evaluate the String CASE alias first, avoiding the type
-- collision.
DROP VIEW IF EXISTS spans_v0;
CREATE VIEW IF NOT EXISTS spans_v0 SQL SECURITY INVOKER AS
    SELECT
        s.span_id AS span_id,
        s.name AS name,
        CASE
            WHEN s.span_type = 0 THEN 'DEFAULT'
            WHEN s.span_type = 1 THEN 'LLM'
            WHEN s.span_type = 3 THEN 'EXECUTOR'
            WHEN s.span_type = 4 THEN 'EVALUATOR'
            WHEN s.span_type = 5 THEN 'EVALUATION'
            WHEN s.span_type = 6 THEN 'TOOL'
            WHEN s.span_type = 7 THEN 'HUMAN_EVALUATOR'
            WHEN s.span_type = 8 THEN 'CACHED'
            ELSE 'UNKNOWN'
        END AS span_type,
        s.start_time AS start_time,
        s.end_time AS end_time,
        s.end_time - s.start_time AS duration,
        s.input_cost AS input_cost,
        s.output_cost AS output_cost,
        s.total_cost AS total_cost,
        s.input_tokens AS input_tokens,
        s.output_tokens AS output_tokens,
        s.total_tokens AS total_tokens,
        s.request_model AS request_model,
        s.response_model AS response_model,
        s.model AS model,
        s.trace_id AS trace_id,
        s.provider AS provider,
        s.path AS path,
        if(
            length(s.input_message_hashes) > 0,
            '[' || arrayStringConcat(
                arrayMap(
                    h -> dictGetOrDefault(
                        'llm_messages_dict',
                        'content',
                        tuple(s.project_id, s.trace_id, h),
                        'null'
                    ),
                    s.input_message_hashes
                ),
                ','
            ) || ']',
            s.input
        ) AS input,
        s.output AS output,
        CASE
            WHEN s.status = 'error' THEN 'error'
            WHEN s.status = 'success' THEN 'success'
            ELSE 'success'
        END AS status,
        s.parent_span_id AS parent_span_id,
        s.attributes AS attributes,
        s.tags_array AS tags,
        s.events AS events
    FROM spans AS s
    WHERE s.project_id = {project_id:UUID}
    SETTINGS optimize_move_to_prewhere = 0;
