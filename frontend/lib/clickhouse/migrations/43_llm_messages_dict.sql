-- LAM-1578 follow-up: move `spans_v0` input reconstruction from a trace-scoped
-- LEFT JOIN + groupArray aggregation onto a ClickHouse Dictionary over
-- `llm_messages`. The previous shape aggregated every row of `llm_messages`
-- for the queried project on every view read because CH cannot push the outer
-- `trace_id` predicate through a `GROUP BY` boundary. Dictionary lookups key
-- by `(project_id, trace_id, message_hash)` directly, so each span pays only
-- for the hashes it actually references.
--
-- Dictionary attribute types cannot be `FixedString(N)` on CH 25.12
-- (UNKNOWN_TYPE at CREATE DICTIONARY); `message_hash` is declared `String`
-- here and CH coerces the `FixedString(32)` hashes in `spans.input_message_hashes`
-- transparently at `dictGetOrDefault` call time.
--
-- COMPLEX_KEY_CACHE layout caches hot tuples in memory with background reload
-- (LIFETIME 30–60s) so the dictionary tracks recent `llm_messages` inserts
-- without a full rebuild.
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
    DB 'default'
))
LAYOUT(COMPLEX_KEY_CACHE(SIZE_IN_CELLS 131072))
LIFETIME(MIN 30 MAX 60);

DROP VIEW IF EXISTS spans_v0;
CREATE VIEW IF NOT EXISTS spans_v0 SQL SECURITY INVOKER AS
    SELECT
        s.span_id AS span_id,
        s.name AS name,
        CASE
            WHEN s.span_type = 0 THEN 'DEFAULT'
            WHEN s.span_type = 1 THEN 'LLM'
            WHEN s.span_type = 3 THEN 'EXECUTOR'
            WHEN s.span_type = 4 THEN 'EVALUATOR'
            WHEN s.span_type = 5 THEN 'EVALUATION'
            WHEN s.span_type = 6 THEN 'TOOL'
            WHEN s.span_type = 7 THEN 'HUMAN_EVALUATOR'
            WHEN s.span_type = 8 THEN 'CACHED'
            ELSE 'UNKNOWN'
        END AS span_type,
        s.start_time AS start_time,
        s.end_time AS end_time,
        s.end_time - s.start_time AS duration,
        s.input_cost AS input_cost,
        s.output_cost AS output_cost,
        s.total_cost AS total_cost,
        s.input_tokens AS input_tokens,
        s.output_tokens AS output_tokens,
        s.total_tokens AS total_tokens,
        s.request_model AS request_model,
        s.response_model AS response_model,
        s.model AS model,
        s.trace_id AS trace_id,
        s.provider AS provider,
        s.path AS path,
        if(
            length(s.input_message_hashes) > 0,
            '[' || arrayStringConcat(
                arrayMap(
                    h -> dictGetOrDefault(
                        'llm_messages_dict',
                        'content',
                        tuple(s.project_id, s.trace_id, h),
                        'null'
                    ),
                    s.input_message_hashes
                ),
                ','
            ) || ']',
            s.input
        ) AS input,
        s.output AS output,
        CASE
            WHEN s.status = 'error' THEN 'error'
            WHEN s.status = 'success' THEN 'success'
            ELSE 'success'
        END AS status,
        s.parent_span_id AS parent_span_id,
        s.attributes AS attributes,
        s.tags_array AS tags,
        s.events AS events
    FROM spans AS s
    WHERE s.project_id = {project_id:UUID};
