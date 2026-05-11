-- Structural deduplication of LLM span input messages.
--
-- Spans reference an ordered array of BLAKE3-256 message hashes
-- (`input_message_hashes`); the canonical message bodies live in
-- `llm_messages`, content-addressed per (project_id, trace_id, message_hash).
-- Dedup is trace-scoped - the same content in two different traces stores as
-- two rows. The `spans_v0` view reconstructs the JSON array transparently so
-- readers keep seeing `input` as a stringified JSON array of messages.

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

-- Rebuild spans_v0 so `input` is reconstructed from hashes when present.
-- We LEFT JOIN the trace's messages (grouped into parallel arrays of hash and
-- content) and rebuild the ordered JSON array via indexOf + arrayMap. The
-- parametrized view's project_id filter on llm_messages keeps the JOIN-side
-- data volume small (one trace's worth of messages per span row).
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
            length(s.input_message_hashes) > 0 AND notEmpty(m.hs),
            concat(
                '[',
                arrayStringConcat(
                    arrayMap(
                        x -> m.cs[indexOf(m.hs, x)],
                        s.input_message_hashes
                    ),
                    ','
                ),
                ']'
            ),
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
