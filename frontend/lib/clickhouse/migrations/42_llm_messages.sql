-- LAM-1578: Structural deduplication for LLM span input message payloads.
-- Dedup is trace-scoped: same content in two different traces produces two rows.
CREATE TABLE IF NOT EXISTS llm_messages
(
    project_id UUID,
    trace_id UUID,
    message_hash FixedString(32),
    content String CODEC(ZSTD(3)),
    last_seen_at DateTime64(9, 'UTC') DEFAULT now() CODEC(DoubleDelta, LZ4)
)
ENGINE = ReplacingMergeTree(last_seen_at)
ORDER BY (project_id, trace_id, message_hash)
SETTINGS index_granularity = 8192;

ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS input_message_hashes Array(FixedString(32)) CODEC(ZSTD(3));

-- Reconstruct `input` from llm_messages via a LEFT JOIN grouped per-trace.
-- Correlated scalar subqueries in a view definition fail on our ClickHouse
-- version (NOT_IMPLEMENTED on the outer row reference), so we materialize the
-- per-trace (hash -> content) arrays once in the join subquery and look up
-- each hash with indexOf. Missing hashes fall back to 'null' so the
-- concatenated array stays parseable by JSON.parse on the frontend. The
-- reconstruction path is taken whenever input_message_hashes is non-empty,
-- regardless of whether the join produced any matches; a completely empty
-- subquery (e.g. CH replication lag between the llm_messages and spans
-- inserts) still yields '[null,...,null]' rather than the cleared '' that
-- would blow up JSON.parse on the frontend.
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
                    h -> ifNull(nullIf(m.cs[indexOf(m.hs, h)], ''), 'null'),
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
    LEFT JOIN (
        SELECT
            trace_id,
            groupArray(message_hash) AS hs,
            groupArray(content) AS cs
        FROM llm_messages
        WHERE project_id = {project_id:UUID}
        GROUP BY trace_id
    ) AS m ON s.trace_id = m.trace_id
    WHERE s.project_id = {project_id:UUID};
