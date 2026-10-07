-- Group-scoped dedup storage (LAM-2234).
--
-- `deduped_content` is keyed `(project_id, content_hash)`, so one trace's
-- messages are scattered over the whole table and reconstructing it costs the
-- dictionary one granule read per distinct hash. `unique_content` leads the
-- key with the span's locality group — its session id when it has one, else its
-- trace id — so a conversation's content is one contiguous key range. Granules
-- are 2 MiB instead of the 10 MiB default to trim the range's boundary waste;
-- smaller buys nothing because compressed blocks are ~1 MiB anyway.
--
-- Forward-only: `deduped_content` keeps serving rows written before this
-- migration and gets no new writes. The views try the `unique_content`
-- dictionary first and fall back to the `deduped_content` one only for hashes
-- `unique_content` does not have. `if`, not `coalesce`/`ifNull`, which evaluate
-- every branch eagerly: both dicts are COMPLEX_KEY_CACHE, so a
-- `deduped_content_dict` lookup for a hash it never had is a cache miss that
-- queries the legacy table (measured on CH 26.5: `coalesce` = one such lookup
-- per hash, `if` = zero). The trace-scoped
-- `llm_messages_dict` leg is gone from every reader; `llm_messages` and its
-- dictionary stay until a follow-up cleanup migration drops them.
CREATE TABLE IF NOT EXISTS unique_content
(
    project_id UUID,
    group_id String,
    content_hash FixedString(32),
    content String CODEC(ZSTD(3)),
    last_seen_at DateTime64(9, 'UTC') DEFAULT now() CODEC(DoubleDelta, LZ4)
)
ENGINE = ReplacingMergeTree(last_seen_at)
ORDER BY (project_id, group_id, content_hash)
-- identical rows will not be merged across partitions
-- but the overhead is low (given this is scoped to trace)
-- and it wins on maintenance / TTLs, so this is deliberate
PARTITION BY toStartOfWeek(last_seen_at)
SETTINGS index_granularity = 8192, index_granularity_bytes = 2097152;

-- `spans_v0`: migration 61's body with the `unique_content` -> `deduped_content` lookup chain. The group is
-- derived from the row itself (`app-server/src/traces/dedup/mod.rs::group_id`
-- is the Rust mirror of `dedup_group`), so no new span column is needed.
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
        ) AS input,
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
        ) AS output,
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

-- `trace_outputs_v0`: the output hashes were written by an LLM span whose group
-- was the session if it was known at ingest, else the trace — and the trace's
-- session may only have arrived on a later span. Try both groups, then `deduped_content`.
DROP VIEW IF EXISTS default.trace_outputs_v0;
CREATE VIEW IF NOT EXISTS default.trace_outputs_v0 SQL SECURITY INVOKER AS
WITH
    ifNull(session_id, '') AS session_group,
    toString(trace_id) AS trace_group
SELECT
    trace_id,
    arrayMap(
        h -> if(
            session_group != ''
                AND isNotNull(dictGetOrNull('unique_content_dict', 'content', tuple(project_id, session_group, h))),
            dictGetOrDefault('unique_content_dict', 'content', tuple(project_id, session_group, h), ''),
            if(
                isNull(dictGetOrNull('unique_content_dict', 'content', tuple(project_id, trace_group, h))),
                dictGetOrDefault('deduped_content_dict', 'content', tuple(project_id, h), ''),
                dictGetOrDefault('unique_content_dict', 'content', tuple(project_id, trace_group, h), '')
            )
        ),
        arrayMap(
            i -> unhex(substring(ifNull(output_hashes, ''), i * 64 + 1, 64)),
            range(intDiv(length(ifNull(output_hashes, '')), 64))
        )
    ) AS agent_output
FROM default.traces_static FINAL
PREWHERE project_id = {project_id:UUID}
WHERE notEmpty(ifNull(output_hashes, ''));
