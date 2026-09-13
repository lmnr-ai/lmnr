-- PII masks and trace-level access policy (docs/internal/rbac.md).
--
-- `dual` PII mode stores the redactor's canonical text once, plus `*_masks`:
-- byte ranges `(start, end, label)` into exactly that string. A masking
-- policy splices `[REDACTED_<LABEL>]` over the ranges at read time via
-- `apply_pii_masks`. `pii_checked` says the redactor screened the row, so a
-- checked row with no masks is safe as-is. Unchecked rows (`off` mode, rows
-- written before this migration, redactor failures) render as unavailable
-- under a masking policy (fail-closed).
ALTER TABLE spans ADD COLUMN IF NOT EXISTS input_masks Array(Tuple(start UInt32, end UInt32, label String)) CODEC(ZSTD(3));
ALTER TABLE spans ADD COLUMN IF NOT EXISTS output_masks Array(Tuple(start UInt32, end UInt32, label String)) CODEC(ZSTD(3));
ALTER TABLE spans ADD COLUMN IF NOT EXISTS pii_checked Bool DEFAULT false;

-- Only the current dedup table gets the columns: legacy `deduped_content`
-- (migration 64) has no writer, so its rows are unchecked by definition.
ALTER TABLE unique_content ADD COLUMN IF NOT EXISTS content_masks Array(Tuple(start UInt32, end UInt32, label String)) CODEC(ZSTD(3));
ALTER TABLE unique_content ADD COLUMN IF NOT EXISTS pii_checked Bool DEFAULT false;

-- SQL UDFs are macro-expanded into the calling query (replicated across a
-- ClickHouse Cloud service). Lambda parameters carry a `pii_` prefix so they
-- cannot capture a caller's column of the same name.
--
-- Read-time twin of app-server's `pii_redactor::masks::apply_masks`; the two
-- must produce identical output. Masks are sorted and non-overlapping; each
-- element is preceded by the text between the previous mask's end and its
-- own start (`arrayPushFront`/`arrayPopBack` shift the ends by one so the
-- lambda pairs every mask with the previous end, and stays size-consistent
-- when `masks` is empty).
CREATE FUNCTION IF NOT EXISTS apply_pii_masks AS (text, masks) -> if(
    empty(masks),
    text,
    arrayStringConcat(
        arrayMap(
            (pii_m, pii_prev_end) -> substring(text, pii_prev_end + 1, tupleElement(pii_m, 1) - pii_prev_end)
                || '[REDACTED_' || upper(tupleElement(pii_m, 3)) || ']',
            masks,
            arrayPopBack(arrayPushFront(arrayMap(pii_x -> tupleElement(pii_x, 2), masks), toUInt32(0)))
        ),
        ''
    ) || substring(text, tupleElement(masks[-1], 2) + 1)
);

-- A metadata value as the string a filter compares against: JSON strings
-- unquoted, everything else (`false`, `42`, objects) as raw JSON. A missing
-- key is `''`.
CREATE FUNCTION IF NOT EXISTS pii_json_scalar AS (doc, key) -> if(
    JSONType(doc, key) = 'String',
    JSONExtractString(doc, key),
    JSONExtractRaw(doc, key)
);

-- Operators of `AccessPolicy.traceFilters`; anything else hides the row.
CREATE FUNCTION IF NOT EXISTS pii_str_op AS (actual, op, expected) -> multiIf(
    op = 'eq', actual = expected,
    op = 'ne', actual != expected,
    false
);

-- Row-level scope from `policy.traceFilters` (AND of every filter) over a
-- trace's `user_id` and `metadata` (`''` when the trace has none). Outer
-- `if` first so a policy without `traceFilters` folds to a constant at
-- analysis time and the dictionary lookup feeding `user_id`/`metadata` is
-- never evaluated. A policy that is not JSON, a `traceFilters` that is not
-- an array, or a filter with an unknown column/operator all hide the row.
CREATE FUNCTION IF NOT EXISTS trace_visible AS (user_id, metadata, policy) -> if(
    NOT JSONHas(policy, 'traceFilters'),
    isValidJSON(policy),
    if(
        JSONType(policy, 'traceFilters') = 'Array',
        arrayAll(
            pii_f -> multiIf(
                tupleElement(pii_f, 'column') = 'user_id',
                    pii_str_op(user_id, tupleElement(pii_f, 'operator'), tupleElement(pii_f, 'value')),
                tupleElement(pii_f, 'column') = 'metadata',
                    pii_str_op(pii_json_scalar(metadata, tupleElement(pii_f, 'key')), tupleElement(pii_f, 'operator'), tupleElement(pii_f, 'value')),
                false
            ),
            JSONExtract(policy, 'traceFilters', 'Array(Tuple(column String, key String, operator String, value String))')
        ),
        false
    )
);

-- `spans_v1` = `spans_v0` (migration 64) plus a `policy` param: a JSON object
-- built server-side from the caller's role (`AccessPolicy` in app-server).
-- `'{}'` means unrestricted and yields exactly `spans_v0`'s output. The
-- dictionaries this view reads (`unique_content_dict` attributes
-- `content_masks` / `pii_checked`, and `trace_access_policy_dict` over
-- `traces_static`) are created by `ensureContentDicts`
-- (frontend/instrumentation.ts) right after migrations run; CREATE VIEW does
-- not resolve dictionaries, so the ordering within one boot is fine.
-- `spans_v0` stays until every caller has moved to `spans_v1`.
--
-- Masked branch (`policy.maskPii`): whole-value columns splice the row's own
-- masks; dedup'd messages and tool definitions resolve per element through
-- `unique_content_dict` alone (the legacy dict has no `pii_checked`, so its
-- rows are unavailable either way and the fallback lookup is skipped). An
-- unavailable value renders as the JSON string `"[PII_MASKED_UNAVAILABLE]"`
-- (whole or per message) so the column stays parseable.
--
-- Scope (`policy.traceFilters`): the span's trace is resolved through
-- `trace_access_policy_dict` and `trace_visible` decides in WHERE; the
-- predicate lands in PREWHERE and, being row-local, keeps projections and
-- lazy materialization usable.
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
                if(pii_checked, apply_pii_masks(input, input_masks), '"[PII_MASKED_UNAVAILABLE]"')
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
                input
            )
        ) AS input,
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
                if(pii_checked, apply_pii_masks(output, output_masks), '"[PII_MASKED_UNAVAILABLE]"')
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
                output
            )
        ) AS output,
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

-- `traces_v1` = `traces_v0` (migration 54) plus the same `policy` param.
-- `traceFilters` are evaluated on the joined `traces_static` row directly.
-- The only content column is `agent_input` (`traces_static.input`, the
-- extracted user task); it has no masks yet, so it is unavailable under a
-- masking policy.
CREATE VIEW IF NOT EXISTS traces_v1 SQL SECURITY INVOKER AS
SELECT
    t.start_time AS start_time,
    t.end_time AS end_time,
    t.input_tokens AS input_tokens,
    t.output_tokens AS output_tokens,
    t.total_tokens AS total_tokens,
    t.cache_read_input_tokens AS cache_read_input_tokens,
    t.cache_creation_input_tokens AS cache_creation_input_tokens,
    t.reasoning_tokens AS reasoning_tokens,
    t.input_cost AS input_cost,
    t.output_cost AS output_cost,
    t.total_cost AS total_cost,
    (toUnixTimestamp64Nano(t.end_time) - toUnixTimestamp64Nano(t.start_time)) / 1000000000 AS duration,
    ifNull(ts.metadata, '') AS metadata,
    ifNull(ts.session_id, '') AS session_id,
    ifNull(ts.user_id, '') AS user_id,
    if(has(t.statuses, 'error'), 'error', 'success') AS status,
    ifNull(ts.root_span_id, toUUID('00000000-0000-0000-0000-000000000000')) AS top_span_id,
    ifNull(coalesce(ts.root_span_name, ts.root_span_name_from_path), '') AS top_span_name,
    CASE
        WHEN ts.root_span_type IS NULL THEN 'DEFAULT'
        WHEN ts.root_span_type = 'DEFAULT' THEN 'DEFAULT'
        WHEN ts.root_span_type = 'LLM' THEN 'LLM'
        WHEN ts.root_span_type = 'EXECUTOR' THEN 'EXECUTOR'
        WHEN ts.root_span_type = 'EVALUATOR' THEN 'EVALUATOR'
        WHEN ts.root_span_type = 'EVALUATION' THEN 'EVALUATION'
        WHEN ts.root_span_type = 'TOOL' THEN 'TOOL'
        WHEN ts.root_span_type = 'HUMAN_EVALUATOR' THEN 'HUMAN_EVALUATOR'
        WHEN ts.root_span_type = 'CACHED' THEN 'CACHED'
        ELSE 'UNKNOWN'
    END AS top_span_type,
    multiIf(
        has(t.trace_types, 'PLAYGROUND'), 'PLAYGROUND',
        has(t.trace_types, 'EVALUATION'), 'EVALUATION',
        'DEFAULT'
    ) AS trace_type,
    t.tags AS tags,
    tt.tags AS trace_tags,
    toBool(ifNull(ts.has_browser_session, 0)) AS has_browser_session,
    t.id AS id,
    t.span_names AS span_names,
    ifNull(ts.internal_metadata, '') AS internal_metadata,
    if(
        JSONExtractBool({policy:String}, 'maskPii'),
        '"[PII_MASKED_UNAVAILABLE]"',
        ifNull(ts.input, '')
    ) AS agent_input
FROM (
    SELECT
        project_id,
        id,
        min(start_time) AS start_time,
        max(end_time) AS end_time,
        sum(input_tokens) AS input_tokens,
        sum(output_tokens) AS output_tokens,
        sum(total_tokens) AS total_tokens,
        sum(cache_read_input_tokens) AS cache_read_input_tokens,
        sum(cache_creation_input_tokens) AS cache_creation_input_tokens,
        sum(reasoning_tokens) AS reasoning_tokens,
        sum(input_cost) AS input_cost,
        sum(output_cost) AS output_cost,
        sum(total_cost) AS total_cost,
        groupUniqArrayArray(statuses) AS statuses,
        groupUniqArrayArray(trace_types) AS trace_types,
        groupUniqArrayArray(tags) AS tags,
        groupUniqArrayArray(span_names) AS span_names
    FROM (
        SELECT *
        FROM traces_agg
        WHERE project_id = {project_id:UUID}
            AND start_time >= {min_start_time:DateTime64(9)}
            AND start_time <= {max_start_time:DateTime64(9)}
    )
    GROUP BY project_id, id
) AS t
LEFT JOIN (
    SELECT * FROM trace_tags FINAL WHERE project_id = {project_id:UUID}
) AS tt
    ON t.project_id = tt.project_id AND t.id = tt.trace_id
LEFT JOIN (
    SELECT *
    FROM traces_static FINAL
    PREWHERE project_id = {project_id:UUID}
        AND start_time >= {min_start_time:DateTime64(9)}
        AND start_time <= {max_start_time:DateTime64(9)}
) AS ts
    ON t.project_id = ts.project_id AND t.id = ts.trace_id
WHERE t.start_time >= {min_start_time:DateTime64(9)}
    AND t.start_time <= {max_start_time:DateTime64(9)}
    AND trace_visible(ifNull(ts.user_id, ''), ifNull(ts.metadata, ''), {policy:String});
