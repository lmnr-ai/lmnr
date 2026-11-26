-- Metric alerts watch production traffic, so the rollup leaves out spans of
-- evaluation (1) and playground (3) traces. The SDKs put the trace type on
-- every span of such a trace. A rule that asks for another trace type has a
-- filter, and filtered rules read the traces instead of this rollup.
ALTER TABLE span_metrics_1m_mv MODIFY QUERY
SELECT
    project_id,
    toDateTime(toStartOfMinute(end_time), 'UTC') AS minute,
    model,
    sum(total_cost) AS total_cost,
    sum(input_tokens) AS input_tokens,
    sum(output_tokens) AS output_tokens,
    sum(total_tokens) AS total_tokens,
    countIf(span_type = 1) AS llm_calls
FROM spans
WHERE spans.trace_type NOT IN (1, 3)
  AND (spans.span_type = 1 OR spans.total_cost != 0 OR spans.total_tokens != 0)
GROUP BY project_id, minute, model;
