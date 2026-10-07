-- Per-span prompt-cache / reasoning token columns (LAM-2217). These were
-- already extracted from `gen_ai.usage.*` at ingest but only summed onto
-- `traces_agg`; now they land on the span row too, mirroring
-- input/output/total tokens. LLM spans only — the ingest gate in
-- `traces/processor.rs` passes a zeroed `SpanUsage` for everything else.
--
-- Deliberately NOT added to the `spans_no_io_by_start_time` PROJECTION:
-- rebuilding it would rewrite the whole table, and the readers of these
-- columns (trace view, single span, shared trace) all filter by `trace_id`
-- and hit the base table's primary key anyway.
ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS cache_read_input_tokens UInt64;

ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS cache_creation_input_tokens UInt64;

ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS reasoning_tokens UInt64;

-- Recreate `spans_v0` verbatim from migration 46 plus the three new columns.
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
        cache_read_input_tokens,
        cache_creation_input_tokens,
        reasoning_tokens,
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
                        dictGetOrNull('deduped_content_dict', 'content', tuple(project_id, h)),
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
                        'deduped_content_dict',
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
            tool_definitions_hash != toFixedString('', 32),
            dictGetOrDefault(
                'deduped_content_dict',
                'content',
                tuple(project_id, tool_definitions_hash),
                ''
            ),
            ''
        ) AS tool_definitions,
        multiIf(status = 'error', 'error', status = 'success', 'success', 'success') AS status,
        parent_span_id,
        attributes,
        tags_array AS tags,
        events
    FROM spans
    WHERE project_id = {project_id:UUID};
