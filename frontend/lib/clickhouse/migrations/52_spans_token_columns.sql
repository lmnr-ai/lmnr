-- LAM-1807 (PR #1943 review): Promote the per-span cache-read / cache-creation /
-- reasoning token counts out of the `trace_view_attributes` materialized JSON
-- (migration 50) into dedicated typed columns on `spans`, populated directly at
-- ingestion in app-server (CHSpan::from_db_span, sourced from SpanUsage). The new
-- OTel convention is dotted (`gen_ai.usage.cache_read.input_tokens`) and the
-- normalization of that dual format already happens in Rust
-- (`normalize_aisdk_attributes`), so the values are easier to account for in code
-- than in a JSON materialized expression. The remaining laminar-internal keys
-- stay in `trace_view_attributes`.
--
-- DEFAULT extracts from `attributes` so historical rows (written before these
-- columns existed) still resolve byte-correctly without a full-table backfill;
-- ingestion writes the explicit value for every new row, so the hot path never
-- reads `attributes` for these counts.
ALTER TABLE default.spans
    ADD COLUMN IF NOT EXISTS cache_read_input_tokens Int64
        DEFAULT JSONExtractInt(attributes, 'gen_ai.usage.cache_read_input_tokens');

ALTER TABLE default.spans
    ADD COLUMN IF NOT EXISTS cache_creation_input_tokens Int64
        DEFAULT JSONExtractInt(attributes, 'gen_ai.usage.cache_creation_input_tokens');

ALTER TABLE default.spans
    ADD COLUMN IF NOT EXISTS reasoning_tokens Int64
        DEFAULT JSONExtractInt(attributes, 'gen_ai.usage.reasoning_tokens');

-- Drop the two token keys from the materialized expression so new rows stop
-- carrying them (migration 50 only ever materialized cache_read + reasoning;
-- cache_creation was never in the JSON). Old parts keep their materialized bytes
-- with the extra keys until merged — harmless, the frontend now reads the
-- dedicated columns. No re-materialize needed.
ALTER TABLE default.spans
    MODIFY COLUMN trace_view_attributes String MATERIALIZED
        concat('{', arrayStringConcat(arrayFilter(x -> x != '', [
            if(JSONHas(attributes, 'lmnr.span.path'), concat('"lmnr.span.path":', JSONExtractRaw(attributes, 'lmnr.span.path')), ''),
            if(JSONHas(attributes, 'lmnr.span.ids_path'), concat('"lmnr.span.ids_path":', JSONExtractRaw(attributes, 'lmnr.span.ids_path')), ''),
            if(JSONHas(attributes, 'lmnr.span.prompt_hash'), concat('"lmnr.span.prompt_hash":', JSONExtractRaw(attributes, 'lmnr.span.prompt_hash')), ''),
            if(JSONHas(attributes, 'lmnr.internal.has_browser_session'), concat('"lmnr.internal.has_browser_session":', JSONExtractRaw(attributes, 'lmnr.internal.has_browser_session')), ''),
            if(JSONHas(attributes, 'lmnr.association.properties.tags'), concat('"lmnr.association.properties.tags":', JSONExtractRaw(attributes, 'lmnr.association.properties.tags')), ''),
            if(JSONHas(attributes, 'lmnr.association.properties.langgraph.nodes'), concat('"lmnr.association.properties.langgraph.nodes":', JSONExtractRaw(attributes, 'lmnr.association.properties.langgraph.nodes')), ''),
            if(JSONHas(attributes, 'lmnr.association.properties.langgraph.edges'), concat('"lmnr.association.properties.langgraph.edges":', JSONExtractRaw(attributes, 'lmnr.association.properties.langgraph.edges')), '')
        ]), ','), '}')
        CODEC(ZSTD(3));

-- Recreate spans_v0 to expose the three new token columns next to attributes.
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
        trace_view_attributes,
        cache_read_input_tokens,
        cache_creation_input_tokens,
        reasoning_tokens,
        tags_array AS tags,
        events
    FROM spans
    WHERE project_id = {project_id:UUID};
