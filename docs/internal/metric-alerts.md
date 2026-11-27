# Metric alerts

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->

Threshold and percent-change rules on a project's traffic, cost, tokens, LLM errors and LLM latency. A rule is a row in `alerts` with `type = 'METRIC'`; the rule itself is the JSON in `alerts.metadata`, and delivery targets are `alert_targets` rows like any other alert. **Every number comes from spans**: there is no trace read anywhere in the feature.

## Storage

- **`span_metrics_1m`** (ClickHouse, migration 90) is a per-minute rollup keyed by `(project_id, minute, model)`. Columns: `span_count` (every span, of any type), summed `total_cost` / `input_tokens` / `output_tokens` / `total_tokens`, and for LLM spans (`span_type = 1`) `llm_calls`, `llm_errors` (`status = 'error'`), `llm_calls_no_cost`, `llm_calls_no_tokens` (zero cost / zero tokens) and `llm_latency_buckets`. The materialized view `span_metrics_1m_mv` fills it from every insert into `spans`, of every span type; a span without a model (most non-LLM spans) lands on the row with model `''`. Readers must `sum()` (`sumMap()` for the buckets) and `GROUP BY`: unmerged parts hold several rows per key.
- **`llm_latency_buckets`** is a histogram, `Map(Int16, UInt64)` merged with `sumMap`: the key is `floor(log(max(duration_ms, 1)) / log(1.05))`, the value the number of LLM calls. A quantile read from it is at most 2.5% off (`ch::span_metrics::LATENCY_BUCKET_BASE`, `series::Sums::llm_latency`). Maps of different minutes and models add up, so a p95 over any window or over all models needs no second query.
- **The rollup holds production traffic only.** The view skips spans whose `trace_type` is evaluation (1) or playground (3). The SDKs and the playground put the trace type on every span of such a trace, so the span's own column is enough. A span that reaches us without it (a custom exporter that only marks the root span) is counted.
- **`minute` is the minute the span ended, not started.** A span is exported when it ends, so its end time is seconds from the insert while its start time is earlier by the whole span duration. Once the spans of a minute are stored, that minute is final: nothing is recounted later, and a window is the plain sum of its minutes, added up in Rust (`series::Series::window`).
- The rollup counts what `spans` holds. A redelivered ingest batch inserts its rows again, and `spans` (plain MergeTree) already counts those twice, so the rollup agrees with it.
- **Nothing is counted per trace.** There is no trace count, errored-trace count, trace duration or cost of one trace. Those need distinct trace ids, which a per-minute sum cannot hold; they would need a separate table.
- The rollup has no rows from before the migration ran. To fill history, run once per deployment (the `created_at` bound keeps rows the view already counted out; it is the time the view was created):

  ```sql
  INSERT INTO span_metrics_1m
  SELECT project_id, toDateTime(toStartOfMinute(end_time), 'UTC') AS minute, model,
         count(), sum(spans.total_cost), sum(spans.input_tokens), sum(spans.output_tokens), sum(spans.total_tokens),
         countIf(span_type = 1), countIf(span_type = 1 AND status = 'error'),
         countIf(span_type = 1 AND spans.total_cost = 0), countIf(span_type = 1 AND spans.total_tokens = 0),
         sumMapIf(map(toInt16(floor(log(greatest(dateDiff('millisecond', start_time, end_time), 1)) / log(1.05))), toUInt64(1)), span_type = 1)
  FROM spans
  WHERE spans.end_time >= now() - INTERVAL 45 DAY
    AND spans.created_at < (SELECT metadata_modification_time FROM system.tables WHERE name = 'span_metrics_1m_mv')
    AND spans.trace_type NOT IN (1, 3)
  GROUP BY project_id, minute, model;
  ```

- `span_metrics_1m` is project-scoped, so it is in the purge list of `deleteProjectDataFromClickHouse`.
- **`metric_alert_states`** (Postgres) holds one row per `(alert_id, group_key)`: current level, the streak being counted, the last processed observation time and the current incident. `group_key` is `''` for rules that are not split. `rule_fingerprint` identifies the rule version the state belongs to.
- **`metric_alert_incidents`** (Postgres) holds one row per incident: level, peak, open/escalate/reopen/resolve times, last notification time and `slack_threads` (channel id to the `ts` of the message that opened the thread).
- drizzle-kit drops `DESC` from a `.desc()` index column when it writes the migration SQL but keeps it in the snapshot. Declare index columns ascending so the SQL and the snapshot agree.
