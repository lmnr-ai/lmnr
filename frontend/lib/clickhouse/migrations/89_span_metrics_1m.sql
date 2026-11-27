-- Per-minute rollup of spans, the only table metric alerts read (LAM-2594).
--
-- One row per (project, minute, model) after merges. Readers must still
-- aggregate and `GROUP BY`, because unmerged parts hold several rows per key.
--
-- `minute` is the minute the span ENDED. A span is exported when it ends, so
-- its end time is within seconds of the insert, while its start time is
-- earlier by the span's whole duration. Once the spans that ended in a minute
-- are stored the minute is final, and a window is the sum of its minutes.
--
-- Every span is counted in `span_count`. Spans without a model, which is most
-- non-LLM spans, share the model ''. The `llm_*` columns count LLM spans only.
-- `llm_latency_buckets` is a histogram of LLM span durations: the key is
-- floor(log(milliseconds) / log(1.05)), so a quantile read from it is off by
-- at most 2.5%.
--
-- Metric alerts watch production traffic, so spans of evaluation (1) and
-- playground (3) traces are left out. The SDKs put the trace type on every
-- span of such a trace.
--
-- 45 days covers the longest comparison (30 days back) plus a 1-day window and
-- a 7-day preview. Whole weekly parts are dropped, so rows live 45 to 52 days.
CREATE TABLE IF NOT EXISTS span_metrics_1m
(
    project_id UUID,
    minute DateTime('UTC'),
    model LowCardinality(String),
    span_count SimpleAggregateFunction(sum, UInt64),
    total_cost SimpleAggregateFunction(sum, Float64),
    input_tokens SimpleAggregateFunction(sum, Int64),
    output_tokens SimpleAggregateFunction(sum, Int64),
    total_tokens SimpleAggregateFunction(sum, Int64),
    llm_calls SimpleAggregateFunction(sum, UInt64),
    llm_errors SimpleAggregateFunction(sum, UInt64),
    llm_calls_no_cost SimpleAggregateFunction(sum, UInt64),
    llm_calls_no_tokens SimpleAggregateFunction(sum, UInt64),
    llm_latency_buckets SimpleAggregateFunction(sumMap, Map(Int16, UInt64))
)
ENGINE = AggregatingMergeTree
PARTITION BY toMonday(minute)
ORDER BY (project_id, minute, model)
TTL minute + INTERVAL 45 DAY
SETTINGS ttl_only_drop_parts = 1;

-- `spans.total_cost` and `spans.total_tokens` name the table because the bare
-- names are this SELECT's aggregate aliases.
CREATE MATERIALIZED VIEW IF NOT EXISTS span_metrics_1m_mv TO span_metrics_1m AS
SELECT
    project_id,
    toDateTime(toStartOfMinute(end_time), 'UTC') AS minute,
    model,
    count() AS span_count,
    sum(total_cost) AS total_cost,
    sum(input_tokens) AS input_tokens,
    sum(output_tokens) AS output_tokens,
    sum(total_tokens) AS total_tokens,
    countIf(span_type = 1) AS llm_calls,
    countIf(span_type = 1 AND status = 'error') AS llm_errors,
    countIf(span_type = 1 AND spans.total_cost = 0) AS llm_calls_no_cost,
    countIf(span_type = 1 AND spans.total_tokens = 0) AS llm_calls_no_tokens,
    sumMapIf(
        map(
            toInt16(floor(log(greatest(dateDiff('millisecond', start_time, end_time), 1)) / log(1.05))),
            toUInt64(1)
        ),
        span_type = 1
    ) AS llm_latency_buckets
FROM spans
WHERE spans.trace_type NOT IN (1, 3)
GROUP BY project_id, minute, model;
