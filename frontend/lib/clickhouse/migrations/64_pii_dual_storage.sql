-- Sparse-dual PII storage for role-based masking (docs/internal/rbac.md).
--
-- `*_redacted` holds the redactor's output only when it changed something.
-- `pii_state` says whether the raw column is safe to show under a masking
-- policy:
--   0 unchecked  default; `off` mode and every row written before this migration
--   1 clean      raw is safe: no PII found, or `redact` mode already stripped it
--   2 redacted   `*_redacted` holds the safe copy; an empty `*_redacted` on a
--                state-2 span row means that side had no PII and raw is safe
--   3 failed     redaction did not complete; raw may hold PII
-- Under a masking policy, 0 and 3 render as unavailable (fail-closed).
ALTER TABLE spans ADD COLUMN IF NOT EXISTS input_redacted String CODEC(ZSTD(3));
ALTER TABLE spans ADD COLUMN IF NOT EXISTS output_redacted String CODEC(ZSTD(3));
ALTER TABLE spans ADD COLUMN IF NOT EXISTS pii_state UInt8 DEFAULT 0;

ALTER TABLE deduped_content ADD COLUMN IF NOT EXISTS content_redacted String CODEC(ZSTD(3));
ALTER TABLE deduped_content ADD COLUMN IF NOT EXISTS pii_state UInt8 DEFAULT 0;

-- `spans_v1` = `spans_v0` (migration 61) plus a `policy` param: a JSON object
-- built server-side from the caller's role (`AccessPolicy` in app-server).
-- `'{}'` means unrestricted and yields exactly `spans_v0`'s output. The
-- `deduped_content_dict` attributes `content_redacted` / `pii_state` are added
-- by `ensureDedupedContentDict` (frontend/instrumentation.ts) right after
-- migrations run; CREATE VIEW does not resolve dictionary attributes, so the
-- ordering within one boot is fine. `spans_v0` stays until every caller has
-- moved to `spans_v1` (dropped in a later migration).
--
-- Masked branch: whole-value columns resolve through the row's `pii_state`;
-- dedup'd messages resolve per message through the dict's `pii_state`, with
-- JSON `null` standing in for an unavailable message so the array stays valid.
-- Legacy `llm_messages_dict` rows have no state and are therefore unavailable
-- under a masking policy.
CREATE VIEW IF NOT EXISTS spans_v1 SQL SECURITY INVOKER AS
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
                        t -> multiIf(
                            tupleElement(t, 3) = 1, tupleElement(t, 1),
                            tupleElement(t, 3) = 2, tupleElement(t, 2),
                            'null'
                        ),
                        arrayMap(
                            h -> dictGetOrDefault(
                                'deduped_content_dict',
                                ('content', 'content_redacted', 'pii_state'),
                                tuple(project_id, h),
                                ('', '', toUInt8(0))
                            ),
                            input_message_hashes
                        )
                    ),
                    ','
                ) || ']',
                multiIf(
                    pii_state = 1, input,
                    pii_state = 2, if(empty(input_redacted), input, input_redacted),
                    '"[PII_MASKED_UNAVAILABLE]"'
                )
            ),
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
            )
        ) AS input,
        if(
            JSONExtractBool({policy:String}, 'maskPii'),
            if(
                notEmpty(output_message_hashes),
                '[' || arrayStringConcat(
                    arrayMap(
                        t -> multiIf(
                            tupleElement(t, 3) = 1, tupleElement(t, 1),
                            tupleElement(t, 3) = 2, tupleElement(t, 2),
                            'null'
                        ),
                        arrayMap(
                            h -> dictGetOrDefault(
                                'deduped_content_dict',
                                ('content', 'content_redacted', 'pii_state'),
                                tuple(project_id, h),
                                ('', '', toUInt8(0))
                            ),
                            output_message_hashes
                        )
                    ),
                    ','
                ) || ']',
                multiIf(
                    pii_state = 1, output,
                    pii_state = 2, if(empty(output_redacted), output, output_redacted),
                    '"[PII_MASKED_UNAVAILABLE]"'
                )
            ),
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
            )
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

-- `traces_v1` = `traces_v0` (migration 54) plus the same `policy` param. The
-- only content column is `agent_input` (`traces_static.input`, the extracted
-- user task); it has no redacted copy yet, so it is unavailable under a
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
    AND t.start_time <= {max_start_time:DateTime64(9)};
