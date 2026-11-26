-- Per-minute rollup of span cost and tokens, read by metric alerts (LAM-2594).
--
-- One row per (project, minute, model) after merges. Readers must still
-- `sum()` and `GROUP BY`, because unmerged parts hold several rows per key.
--
-- `minute` is the minute the span ENDED. A span is exported when it ends, so
-- its end time is within seconds of the insert, while its start time is
-- earlier by the span's whole duration. Bucketing by end time lets a reader
-- treat a minute as complete shortly after it passes.
--
-- Only spans that carry cost or tokens are rolled up (LLM spans and anything
-- else with usage). Trace-level numbers (trace count, error rate, duration)
-- are read from `traces_agg`, which already defines a trace.
--
-- Metric alerts watch production traffic, so spans of evaluation (1) and
-- playground (3) traces are left out. The SDKs put the trace type on every
-- span of such a trace. A rule that asks for another trace type has a filter,
-- and filtered rules read the traces instead of this rollup.
--
-- 45 days covers the longest comparison (30 days back) plus a 1-day window and
-- a 7-day preview. Whole weekly parts are dropped, so rows live 45 to 52 days.
CREATE TABLE IF NOT EXISTS span_metrics_1m
(
    project_id UUID,
    minute DateTime('UTC'),
    model LowCardinality(String),
    total_cost SimpleAggregateFunction(sum, Float64),
    input_tokens SimpleAggregateFunction(sum, Int64),
    output_tokens SimpleAggregateFunction(sum, Int64),
    total_tokens SimpleAggregateFunction(sum, Int64),
    llm_calls SimpleAggregateFunction(sum, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toMonday(minute)
ORDER BY (project_id, minute, model)
TTL minute + INTERVAL 45 DAY
SETTINGS ttl_only_drop_parts = 1;

-- The WHERE clause names the table because the bare names are this SELECT's
-- aggregate aliases.
CREATE MATERIALIZED VIEW IF NOT EXISTS span_metrics_1m_mv TO span_metrics_1m AS
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
