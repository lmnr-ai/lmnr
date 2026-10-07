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

-- Add `span_kind` as an alias column of `span_type` so the `spans_v0` view can
-- expose the string-cast projection aliased as `span_type` without colliding
-- with the underlying UInt8 column. Existing and new rows auto-populate via
-- DEFAULT span_type; ingestion continues writing `span_type`.
ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS span_kind UInt8 DEFAULT span_type;

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
