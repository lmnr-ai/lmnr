-- LAM-1807 (stacked): Store the small subset of attribute keys the trace-view
-- tree actually reads in dedicated columns so the per-span tree query stops
-- reading the full `attributes` blob off disk (profiling showed ~99% of the
-- read bytes came from `attributes`; ~11.5 MiB → ~185 KiB per large trace).
--
-- Two storage shapes, both written by Rust at ingestion (`CHSpan::from_db_span`):
--   * `trace_view_attributes` — a plain `String` column holding a compact JSON
--     object of the laminar-internal keys (path, ids_path, prompt_hash,
--     has_browser_session, association tags). Built in Rust and inserted as a
--     string; the frontend selects it instead of extracting from the full
--     `attributes` blob. NOT a `MATERIALIZED` expression — building it in code
--     keeps this migration a plain instant `ADD COLUMN`, avoids re-parsing
--     `attributes` on every insert, and makes extending the key set a normal
--     code change rather than hand-written SQL string-concatenation.
--   * `cache_read_input_tokens` / `cache_creation_input_tokens` /
--     `reasoning_tokens` — dedicated `UInt64` columns (PR #1943 review). The new
--     OTel convention is dotted (`gen_ai.usage.cache_read.input_tokens`) and
--     that dual format is already normalized to the underscore key in Rust
--     (`normalize_aisdk_attributes`) before `SpanUsage` is built — accounted for
--     in code, not in a SQL expression. Written explicitly in `from_db_span`.
--
-- All columns are plain `ADD COLUMN` with NO attributes-referencing `DEFAULT`
-- and NO `MATERIALIZE COLUMN` backfill: a `DEFAULT JSONExtract(attributes,…)`
-- would force old parts to re-read the full `attributes` blob on read (defeating
-- the optimization) and would miss dotted-format spans, while `MATERIALIZE` is a
-- full-table mutation that is painful on the unpartitioned multi-TB `spans`
-- table. New spans are populated by Rust; pre-migration rows read empty / 0 and
-- age out.
ALTER TABLE default.spans
    ADD COLUMN IF NOT EXISTS trace_view_attributes String CODEC(ZSTD(3));

ALTER TABLE default.spans
    ADD COLUMN IF NOT EXISTS cache_read_input_tokens UInt64;

ALTER TABLE default.spans
    ADD COLUMN IF NOT EXISTS cache_creation_input_tokens UInt64;

ALTER TABLE default.spans
    ADD COLUMN IF NOT EXISTS reasoning_tokens UInt64;

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
