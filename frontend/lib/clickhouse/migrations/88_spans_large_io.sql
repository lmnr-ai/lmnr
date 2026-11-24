-- Large non-LLM span payloads (LAM-2580).
--
-- A whole-value `input` / `output` of a DEFAULT, TOOL, EXECUTOR, EVALUATOR or
-- EVALUATION span above `LARGE_PAYLOAD_THRESHOLD_BYTES` (app-server, default
-- 100 KiB) is stored here, one row per (span, direction). The `spans` row keeps
-- a bounded JSON preview in `input` / `output` and sets `input_offloaded` /
-- `output_offloaded`. These rows are 0.3% of default-span payloads but ~70%
-- of their bytes, so leaving them inline made every granule that held one
-- decompress it for its 8191 neighbours.
--
-- Rows are at least the threshold, and adaptive granularity sizes a granule
-- from the insert block's average row size, so `index_granularity_bytes` at
-- the threshold gives one row per granule: a lookup reads only its payload.
-- ReplacingMergeTree collapses the duplicate a retried consumer batch writes.
-- `start_time` is the span's, for partition drops alongside `spans` retention.
CREATE TABLE IF NOT EXISTS spans_large_io
(
    project_id UUID,
    trace_id UUID,
    span_id UUID,
    is_output Bool,
    start_time DateTime64(9, 'UTC'),
    content String CODEC(ZSTD(3)),
    content_masks Array(Tuple(start UInt32, end UInt32, label String)) CODEC(ZSTD(3)),
    pii_checked Bool DEFAULT false
)
ENGINE = ReplacingMergeTree
PARTITION BY toStartOfWeek(start_time)
ORDER BY (project_id, trace_id, span_id, is_output)
SETTINGS index_granularity = 8192, index_granularity_bytes = 102400;

ALTER TABLE spans ADD COLUMN IF NOT EXISTS input_offloaded Bool DEFAULT false;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS output_offloaded Bool DEFAULT false;

-- Both views restore the full value through `spans_large_io_dict`
-- (COMPLEX_KEY_DIRECT, created by `ensureContentDicts` in
-- frontend/instrumentation.ts): no cache, so multi-MiB values are never held
-- in memory between queries, and the `multiIf` short-circuits, so rows not
-- offloaded, and queries that don't select the column, issue no lookups. A
-- missing row falls back to the preview (the masked branch fails closed).
--
-- `input_preview` / `output_preview` are the stored values: the preview for an
-- offloaded field, otherwise identical to `input` / `output`. Bulk readers
-- (whole-trace fetches for signals, the agent, outlines) select these so they
-- never pull the large payloads. They read `spans.input` qualified: the bare
-- name is the `input` alias of this SELECT.
DROP VIEW IF EXISTS spans_v0;
CREATE VIEW IF NOT EXISTS spans_v0 SQL SECURITY INVOKER AS
    WITH if(session_id != '', session_id, toString(trace_id)) AS dedup_group
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
        multiIf(
            notEmpty(input_message_hashes),
            '[' || arrayStringConcat(
                arrayMap(
                    h -> if(
                        isNull(dictGetOrNull('unique_content_dict', 'content', tuple(project_id, dedup_group, h))),
                        dictGetOrDefault('deduped_content_dict', 'content', tuple(project_id, h), 'null'),
                        dictGetOrDefault('unique_content_dict', 'content', tuple(project_id, dedup_group, h), 'null')
                    ),
                    input_message_hashes
                ),
                ','
            ) || ']',
            input_offloaded,
            dictGetOrDefault('spans_large_io_dict', 'content', tuple(project_id, trace_id, span_id, false), spans.input),
            spans.input
        ) AS input,
        multiIf(
            notEmpty(output_message_hashes),
            '[' || arrayStringConcat(
                arrayMap(
                    h -> if(
                        isNull(dictGetOrNull('unique_content_dict', 'content', tuple(project_id, dedup_group, h))),
                        dictGetOrDefault('deduped_content_dict', 'content', tuple(project_id, h), 'null'),
                        dictGetOrDefault('unique_content_dict', 'content', tuple(project_id, dedup_group, h), 'null')
                    ),
                    output_message_hashes
                ),
                ','
            ) || ']',
            output_offloaded,
            dictGetOrDefault('spans_large_io_dict', 'content', tuple(project_id, trace_id, span_id, true), spans.output),
            spans.output
        ) AS output,
        if(
            notEmpty(input_message_hashes),
            '[' || arrayStringConcat(
                arrayMap(
                    h -> if(
                        isNull(dictGetOrNull('unique_content_dict', 'content', tuple(project_id, dedup_group, h))),
                        dictGetOrDefault('deduped_content_dict', 'content', tuple(project_id, h), 'null'),
                        dictGetOrDefault('unique_content_dict', 'content', tuple(project_id, dedup_group, h), 'null')
                    ),
                    input_message_hashes
                ),
                ','
            ) || ']',
            spans.input
        ) AS input_preview,
        if(
            notEmpty(output_message_hashes),
            '[' || arrayStringConcat(
                arrayMap(
                    h -> if(
                        isNull(dictGetOrNull('unique_content_dict', 'content', tuple(project_id, dedup_group, h))),
                        dictGetOrDefault('deduped_content_dict', 'content', tuple(project_id, h), 'null'),
                        dictGetOrDefault('unique_content_dict', 'content', tuple(project_id, dedup_group, h), 'null')
                    ),
                    output_message_hashes
                ),
                ','
            ) || ']',
            spans.output
        ) AS output_preview,
        if(
            tool_definitions_hash != toFixedString('', 32),
            if(
                isNull(dictGetOrNull('unique_content_dict', 'content', tuple(project_id, dedup_group, tool_definitions_hash))),
                dictGetOrDefault('deduped_content_dict', 'content', tuple(project_id, tool_definitions_hash), ''),
                dictGetOrDefault('unique_content_dict', 'content', tuple(project_id, dedup_group, tool_definitions_hash), '')
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

-- `spans_v1`: migration 66's body with the same two additions. Under
-- `maskPii` an offloaded field splices its own row's masks (single-element
-- `arrayMap` so the dict tuple is fetched once, as `tool_definitions` does);
-- the preview needs none, since app-server builds it from already-redacted
-- text in `dual` mode.
DROP VIEW IF EXISTS spans_v1;
CREATE VIEW IF NOT EXISTS spans_v1 SQL SECURITY INVOKER AS
    WITH
        if(session_id != '', session_id, toString(trace_id)) AS dedup_group,
        dictGetOrDefault(
            'trace_access_policy_dict',
            ('user_id', 'metadata'),
            (project_id, trace_id),
            ('', '')
        ) AS trace_scope
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
            JSONExtractBool({policy:String}, 'maskPii'),
            multiIf(
                notEmpty(input_message_hashes),
                '[' || arrayStringConcat(
                    arrayMap(
                        t -> if(
                            tupleElement(t, 3),
                            apply_pii_masks(tupleElement(t, 1), tupleElement(t, 2)),
                            '"[PII_MASKED_UNAVAILABLE]"'
                        ),
                        arrayMap(
                            h -> dictGetOrDefault(
                                'unique_content_dict',
                                ('content', 'content_masks', 'pii_checked'),
                                tuple(project_id, dedup_group, h),
                                ('', [], false)
                            ),
                            input_message_hashes
                        )
                    ),
                    ','
                ) || ']',
                input_offloaded,
                arrayMap(
                    t -> if(
                        tupleElement(t, 3),
                        apply_pii_masks(tupleElement(t, 1), tupleElement(t, 2)),
                        '"[PII_MASKED_UNAVAILABLE]"'
                    ),
                    [dictGetOrDefault(
                        'spans_large_io_dict',
                        ('content', 'content_masks', 'pii_checked'),
                        tuple(project_id, trace_id, span_id, false),
                        ('', [], false)
                    )]
                )[1],
                if(pii_checked, apply_pii_masks(spans.input, input_masks), '"[PII_MASKED_UNAVAILABLE]"')
            ),
            multiIf(
                notEmpty(input_message_hashes),
                '[' || arrayStringConcat(
                    arrayMap(
                        h -> if(
                            isNull(dictGetOrNull('unique_content_dict', 'content', tuple(project_id, dedup_group, h))),
                            dictGetOrDefault('deduped_content_dict', 'content', tuple(project_id, h), 'null'),
                            dictGetOrDefault('unique_content_dict', 'content', tuple(project_id, dedup_group, h), 'null')
                        ),
                        input_message_hashes
                    ),
                    ','
                ) || ']',
                input_offloaded,
                dictGetOrDefault('spans_large_io_dict', 'content', tuple(project_id, trace_id, span_id, false), spans.input),
                spans.input
            )
        ) AS input,
        if(
            JSONExtractBool({policy:String}, 'maskPii'),
            multiIf(
                notEmpty(output_message_hashes),
                '[' || arrayStringConcat(
                    arrayMap(
                        t -> if(
                            tupleElement(t, 3),
                            apply_pii_masks(tupleElement(t, 1), tupleElement(t, 2)),
                            '"[PII_MASKED_UNAVAILABLE]"'
                        ),
                        arrayMap(
                            h -> dictGetOrDefault(
                                'unique_content_dict',
                                ('content', 'content_masks', 'pii_checked'),
                                tuple(project_id, dedup_group, h),
                                ('', [], false)
                            ),
                            output_message_hashes
                        )
                    ),
                    ','
                ) || ']',
                output_offloaded,
                arrayMap(
                    t -> if(
                        tupleElement(t, 3),
                        apply_pii_masks(tupleElement(t, 1), tupleElement(t, 2)),
                        '"[PII_MASKED_UNAVAILABLE]"'
                    ),
                    [dictGetOrDefault(
                        'spans_large_io_dict',
                        ('content', 'content_masks', 'pii_checked'),
                        tuple(project_id, trace_id, span_id, true),
                        ('', [], false)
                    )]
                )[1],
                if(pii_checked, apply_pii_masks(spans.output, output_masks), '"[PII_MASKED_UNAVAILABLE]"')
            ),
            multiIf(
                notEmpty(output_message_hashes),
                '[' || arrayStringConcat(
                    arrayMap(
                        h -> if(
                            isNull(dictGetOrNull('unique_content_dict', 'content', tuple(project_id, dedup_group, h))),
                            dictGetOrDefault('deduped_content_dict', 'content', tuple(project_id, h), 'null'),
                            dictGetOrDefault('unique_content_dict', 'content', tuple(project_id, dedup_group, h), 'null')
                        ),
                        output_message_hashes
                    ),
                    ','
                ) || ']',
                output_offloaded,
                dictGetOrDefault('spans_large_io_dict', 'content', tuple(project_id, trace_id, span_id, true), spans.output),
                spans.output
            )
        ) AS output,
        if(
            JSONExtractBool({policy:String}, 'maskPii'),
            if(
                notEmpty(input_message_hashes),
                '[' || arrayStringConcat(
                    arrayMap(
                        t -> if(
                            tupleElement(t, 3),
                            apply_pii_masks(tupleElement(t, 1), tupleElement(t, 2)),
                            '"[PII_MASKED_UNAVAILABLE]"'
                        ),
                        arrayMap(
                            h -> dictGetOrDefault(
                                'unique_content_dict',
                                ('content', 'content_masks', 'pii_checked'),
                                tuple(project_id, dedup_group, h),
                                ('', [], false)
                            ),
                            input_message_hashes
                        )
                    ),
                    ','
                ) || ']',
                if(pii_checked, apply_pii_masks(spans.input, input_masks), '"[PII_MASKED_UNAVAILABLE]"')
            ),
            if(
                notEmpty(input_message_hashes),
                '[' || arrayStringConcat(
                    arrayMap(
                        h -> if(
                            isNull(dictGetOrNull('unique_content_dict', 'content', tuple(project_id, dedup_group, h))),
                            dictGetOrDefault('deduped_content_dict', 'content', tuple(project_id, h), 'null'),
                            dictGetOrDefault('unique_content_dict', 'content', tuple(project_id, dedup_group, h), 'null')
                        ),
                        input_message_hashes
                    ),
                    ','
                ) || ']',
                spans.input
            )
        ) AS input_preview,
        if(
            JSONExtractBool({policy:String}, 'maskPii'),
            if(
                notEmpty(output_message_hashes),
                '[' || arrayStringConcat(
                    arrayMap(
                        t -> if(
                            tupleElement(t, 3),
                            apply_pii_masks(tupleElement(t, 1), tupleElement(t, 2)),
                            '"[PII_MASKED_UNAVAILABLE]"'
                        ),
                        arrayMap(
                            h -> dictGetOrDefault(
                                'unique_content_dict',
                                ('content', 'content_masks', 'pii_checked'),
                                tuple(project_id, dedup_group, h),
                                ('', [], false)
                            ),
                            output_message_hashes
                        )
                    ),
                    ','
                ) || ']',
                if(pii_checked, apply_pii_masks(spans.output, output_masks), '"[PII_MASKED_UNAVAILABLE]"')
            ),
            if(
                notEmpty(output_message_hashes),
                '[' || arrayStringConcat(
                    arrayMap(
                        h -> if(
                            isNull(dictGetOrNull('unique_content_dict', 'content', tuple(project_id, dedup_group, h))),
                            dictGetOrDefault('deduped_content_dict', 'content', tuple(project_id, h), 'null'),
                            dictGetOrDefault('unique_content_dict', 'content', tuple(project_id, dedup_group, h), 'null')
                        ),
                        output_message_hashes
                    ),
                    ','
                ) || ']',
                spans.output
            )
        ) AS output_preview,
        if(
            tool_definitions_hash != toFixedString('', 32),
            if(
                JSONExtractBool({policy:String}, 'maskPii'),
                -- Single-element arrayMap so the dict tuple is fetched once.
                arrayMap(
                    t -> if(
                        tupleElement(t, 3),
                        apply_pii_masks(tupleElement(t, 1), tupleElement(t, 2)),
                        '"[PII_MASKED_UNAVAILABLE]"'
                    ),
                    [dictGetOrDefault(
                        'unique_content_dict',
                        ('content', 'content_masks', 'pii_checked'),
                        tuple(project_id, dedup_group, tool_definitions_hash),
                        ('', [], false)
                    )]
                )[1],
                if(
                    isNull(dictGetOrNull('unique_content_dict', 'content', tuple(project_id, dedup_group, tool_definitions_hash))),
                    dictGetOrDefault('deduped_content_dict', 'content', tuple(project_id, tool_definitions_hash), ''),
                    dictGetOrDefault('unique_content_dict', 'content', tuple(project_id, dedup_group, tool_definitions_hash), '')
                )
            ),
            ''
        ) AS tool_definitions,
        multiIf(status = 'error', 'error', status = 'success', 'success', 'success') AS status,
        parent_span_id,
        attributes,
        tags_array AS tags,
        events
    FROM spans
    WHERE project_id = {project_id:UUID}
        AND trace_visible(tupleElement(trace_scope, 1), tupleElement(trace_scope, 2), {policy:String});
