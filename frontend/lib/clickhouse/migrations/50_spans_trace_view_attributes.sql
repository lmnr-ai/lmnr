-- LAM-1807 (stacked): Materialize the small subset of attribute keys the
-- trace-view tree actually reads into dedicated columns so the per-span tree
-- query stops reading the full `attributes` blob off disk (profiling showed
-- ~99% of the read bytes came from `attributes`; ~11.5 MiB → ~185 KiB per
-- large trace).
--
-- Two storage shapes:
--   * `trace_view_attributes` — a compact MATERIALIZED JSON object of the
--     laminar-internal keys (path, ids_path, prompt_hash, has_browser_session,
--     association tags). The frontend selects this instead of extracting from
--     the full `attributes` blob.
--   * `cache_read_input_tokens` / `cache_creation_input_tokens` /
--     `reasoning_tokens` — dedicated Int64 columns (PR #1943 review). These are
--     promoted out of the JSON because the new OTel convention is dotted
--     (`gen_ai.usage.cache_read.input_tokens`) and that dual format is already
--     normalized to the underscore key in Rust (`normalize_aisdk_attributes`)
--     before `SpanUsage` is built — easier to account for in code than in a
--     materialized expression. Ingestion writes the explicit value in
--     `CHSpan::from_db_span`; the `DEFAULT JSONExtractInt(...)` resolves
--     historical rows without a backfill.
--
-- No SQL coalesce fallback by design: selecting `attributes` at all forces
-- ClickHouse to read that whole column per granule, defeating the win. Existing
-- rows are prefilled via `MATERIALIZE COLUMN` (the `spans` table has no
-- PARTITION BY, so this is a single full-table mutation that runs async).
ALTER TABLE default.spans
    ADD COLUMN IF NOT EXISTS trace_view_attributes String MATERIALIZED
        concat('{', arrayStringConcat(arrayFilter(x -> x != '', [
            if(JSONHas(attributes, 'lmnr.span.path'), concat('"lmnr.span.path":', JSONExtractRaw(attributes, 'lmnr.span.path')), ''),
            if(JSONHas(attributes, 'lmnr.span.ids_path'), concat('"lmnr.span.ids_path":', JSONExtractRaw(attributes, 'lmnr.span.ids_path')), ''),
            if(JSONHas(attributes, 'lmnr.span.prompt_hash'), concat('"lmnr.span.prompt_hash":', JSONExtractRaw(attributes, 'lmnr.span.prompt_hash')), ''),
            if(JSONHas(attributes, 'lmnr.internal.has_browser_session'), concat('"lmnr.internal.has_browser_session":', JSONExtractRaw(attributes, 'lmnr.internal.has_browser_session')), ''),
            if(JSONHas(attributes, 'lmnr.association.properties.tags'), concat('"lmnr.association.properties.tags":', JSONExtractRaw(attributes, 'lmnr.association.properties.tags')), '')
        ]), ','), '}')
        CODEC(ZSTD(3));

ALTER TABLE default.spans
    ADD COLUMN IF NOT EXISTS cache_read_input_tokens Int64
        DEFAULT JSONExtractInt(attributes, 'gen_ai.usage.cache_read_input_tokens');

ALTER TABLE default.spans
    ADD COLUMN IF NOT EXISTS cache_creation_input_tokens Int64
        DEFAULT JSONExtractInt(attributes, 'gen_ai.usage.cache_creation_input_tokens');

ALTER TABLE default.spans
    ADD COLUMN IF NOT EXISTS reasoning_tokens Int64
        DEFAULT JSONExtractInt(attributes, 'gen_ai.usage.reasoning_tokens');

-- Prefill existing parts so the column is physically materialized on disk for
-- old rows too (otherwise old parts would re-evaluate the expression on read,
-- which still touches `attributes`).
ALTER TABLE default.spans
    MATERIALIZE COLUMN trace_view_attributes;

-- Recreate spans_v0 to expose the new columns (mirrors migration 46, with
-- `trace_view_attributes` + the three token columns added next to `attributes`).
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
