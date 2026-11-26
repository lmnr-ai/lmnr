# Metric alerts

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->

Threshold and percent-change rules on a project's cost, tokens, traffic, error rate and latency. A rule is a row in `alerts` with `type = 'METRIC'`; the rule itself is the JSON in `alerts.metadata`, and delivery targets are `alert_targets` rows like any other alert.

## Storage

- **`span_metrics_1m`** (ClickHouse, migration 89) is a per-minute rollup keyed by `(project_id, minute, model)` with summed cost, tokens and LLM call count. The materialized view `span_metrics_1m_mv` fills it from every insert into `spans`. Readers must `sum()` and `GROUP BY`: unmerged parts hold several rows per key.
- **The rollup holds production traffic only.** Migration 90 makes the view skip spans whose `trace_type` is evaluation (1) or playground (3). The SDKs and the playground put the trace type on every span of such a trace, so the span's own column is enough. A span that reaches us without it (a custom exporter that only marks the root span) is counted.
- **`minute` is the minute the span ended, not started.** A span is exported when it ends, so its end time is seconds from the insert while its start time is earlier by the whole span duration. A reader can treat a minute as complete shortly after it passes.
- The rollup counts what `spans` holds. A redelivered ingest batch inserts its rows again, and `spans` (plain MergeTree) and `traces_agg` (`sum` columns) already count those twice, so the rollup agrees with both.
- Trace-level numbers (trace count, error rate, duration, cost of one trace) are NOT in the rollup. A trace is "errored" on the traces page when any span errored (`has(statuses, 'error')` in `traces_agg`), and the root span arrives last or never, so counting root spans in a per-minute view would give different numbers than the traces page. Read those from `traces_agg`.
- The rollup has no rows from before the migrations ran. To fill history, run once per deployment (the `created_at` bound keeps rows the view already counted out; it is the time migration 90 last changed the view):

  ```sql
  INSERT INTO span_metrics_1m
  SELECT project_id, toDateTime(toStartOfMinute(end_time), 'UTC') AS minute, model,
         sum(total_cost), sum(input_tokens), sum(output_tokens), sum(total_tokens), countIf(span_type = 1)
  FROM spans
  WHERE spans.end_time >= now() - INTERVAL 45 DAY
    AND spans.created_at < (SELECT metadata_modification_time FROM system.tables WHERE name = 'span_metrics_1m_mv')
    AND spans.trace_type NOT IN (1, 3)
    AND (spans.span_type = 1 OR spans.total_cost != 0 OR spans.total_tokens != 0)
  GROUP BY project_id, minute, model;
  ```

- `span_metrics_1m` is project-scoped, so it is in the purge list of `deleteProjectDataFromClickHouse`.
- **`metric_alert_states`** (Postgres) holds one row per `(alert_id, group_key)`: current level, the streak being counted, the last processed observation time and the current incident. `group_key` is `''` for rules that are not split. `rule_fingerprint` identifies the rule version the state belongs to.
- **`metric_alert_incidents`** (Postgres) holds one row per incident: level, peak, open/escalate/reopen/resolve times, last notification time and `slack_threads` (channel id to the `ts` of the message that opened the thread).
- drizzle-kit drops `DESC` from a `.desc()` index column when it writes the migration SQL but keeps it in the snapshot. Declare index columns ascending so the SQL and the snapshot agree.
