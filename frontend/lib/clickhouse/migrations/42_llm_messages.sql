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
            span_type = 0, 'DEFAULT',
            span_type = 1, 'LLM',
            span_type = 3, 'EXECUTOR',
            span_type = 4, 'EVALUATOR',
            span_type = 5, 'EVALUATION',
            span_type = 6, 'TOOL',
            span_type = 7, 'HUMAN_EVALUATOR',
            span_type = 8, 'CACHED',
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
