-- Project-scoped dedup for input/output messages and tool definitions.
-- The `shared_content` table is content-addressed by `(project_id, content_hash)`
-- and stores any JSON blob the spans table references by hash. Same hash
-- collapses across traces, across input/output, and across tools.
CREATE TABLE IF NOT EXISTS shared_content
(
    project_id UUID,
    content_hash FixedString(32),
    content String CODEC(ZSTD(3)),
    last_seen_at DateTime64(9, 'UTC') DEFAULT now() CODEC(DoubleDelta, LZ4)
)
ENGINE = ReplacingMergeTree(last_seen_at)
ORDER BY (project_id, content_hash)
SETTINGS index_granularity = 8192;

ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS output_message_hashes Array(FixedString(32)) CODEC(ZSTD(3));

ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS output_new_message_indices Array(UInt16) CODEC(ZSTD(3));

ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS tool_definition_hash FixedString(32) DEFAULT toFixedString('', 32) CODEC(ZSTD(3));

-- Forward-only migration: legacy spans keep their `input_message_hashes` resolved
-- against the trace-scoped `llm_messages_dict` (created by `ensureLlmMessagesDict`
-- in `frontend/instrumentation.ts`). New spans resolve against the project-scoped
-- `shared_content_dict` (created by `ensureSharedContentDict`). The view's
-- `coalesce` falls through automatically for each row.
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
                    h -> coalesce(
                        dictGetOrNull('shared_content_dict', 'content', tuple(project_id, h)),
                        dictGetOrNull('llm_messages_dict', 'content', tuple(project_id, trace_id, h)),
                        'null'
                    ),
                    input_message_hashes
                ),
                ','
            ) || ']',
            input
        ) AS input,
        if(
            notEmpty(output_message_hashes),
            '[' || arrayStringConcat(
                arrayMap(
                    h -> dictGetOrDefault(
                        'shared_content_dict',
                        'content',
                        tuple(project_id, h),
                        'null'
                    ),
                    output_message_hashes
                ),
                ','
            ) || ']',
            output
        ) AS output,
        if(
            tool_definition_hash != toFixedString('', 32),
            dictGetOrDefault(
                'shared_content_dict',
                'content',
                tuple(project_id, tool_definition_hash),
                ''
            ),
            ''
        ) AS tools,
        multiIf(status = 'error', 'error', status = 'success', 'success', 'success') AS status,
        parent_span_id,
        attributes,
        tags_array AS tags,
        events
    FROM spans
    WHERE project_id = {project_id:UUID};
