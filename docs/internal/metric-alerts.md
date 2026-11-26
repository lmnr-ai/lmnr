# Metric alerts

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->

Threshold and percent-change rules on a project's cost, tokens, traffic, error rate and latency. A rule is a row in `alerts` with `type = 'METRIC'`; the rule itself is the JSON in `alerts.metadata`, and delivery targets are `alert_targets` rows like any other alert.

## Storage

- **`span_metrics_1m`** (ClickHouse, migration 89) is a per-minute rollup keyed by `(project_id, minute, model)` with summed cost, tokens and LLM call count. The materialized view `span_metrics_1m_mv` fills it from every insert into `spans`. Readers must `sum()` and `GROUP BY`: unmerged parts hold several rows per key.
- **The rollup holds production traffic only.** The view skips spans whose `trace_type` is evaluation (1) or playground (3). The SDKs and the playground put the trace type on every span of such a trace, so the span's own column is enough. A span that reaches us without it (a custom exporter that only marks the root span) is counted.
- **`minute` is the minute the span ended, not started.** A span is exported when it ends, so its end time is seconds from the insert while its start time is earlier by the whole span duration. A reader can treat a minute as complete shortly after it passes.
- The rollup counts what `spans` holds. A redelivered ingest batch inserts its rows again, and `spans` (plain MergeTree) and `traces_agg` (`sum` columns) already count those twice, so the rollup agrees with both.
- Trace-level numbers (trace count, error rate, duration, cost of one trace) are NOT in the rollup. A trace is "errored" on the traces page when any span errored (`has(statuses, 'error')` in `traces_agg`), and the root span arrives last or never, so counting root spans in a per-minute view would give different numbers than the traces page. Read those from `traces_agg`.
- The rollup has no rows from before the migration ran. To fill history, run once per deployment (the `created_at` bound keeps rows the view already counted out; it is the time the view was created):

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

## Evaluation (`app-server/src/metric_alerts/`)

- **`engine::evaluate(rule, &mut state, observation) -> Option<Transition>` is pure** and is the only place that decides levels, incidents and reminders. The scheduler and the preview both call it, so a rule previews exactly as it will run. Keep IO out of it; add a row to the table test in `engine_tests.rs` for every behaviour change.
- **Checks in a row.** The level moves only after `checksInARow` consecutive checks ask to move it in the same direction, and only as far as all of them agree. A check that agrees with the current level resets the count. A skipped check (no data with `skip`, too few traces, ingestion behind) leaves the state untouched and does not break a streak.
- **A window slides.** A 5-minute sum checked every minute still contains a 2-minute burst five checks later. "Checks in a row" absorbs a burst only when the window total stays under the line; a short burst that lifts the whole window over it fires. Longer windows and `minChange` are the tools for that.
- **Windows** are 5, 15 or 30 minutes, 1 hour or 1 day. A `change` rule compares to the same window 5, 15 or 30 minutes, 1 hour, 1 day, 1 week or 30 days earlier.
- **Thresholds.** A breach is strict (`value > warning`), a resolve is inclusive (`value <= resolve`). `resolve` is optional: unset, the rule resolves at its first alerting threshold (warning, or critical when there is no warning), and "checks in a row" is what keeps a value sitting on the line from flapping. While an incident is open only the resolve threshold returns it to OK; a value between resolve and warning holds Warning, or steps Critical down to Warning.
- **No data.** `onNoData` unset means `zero` for sums, counts (trace count, errored traces) and single-trace cost (a sum over nothing is zero, so "traffic stopped" fires and a cost incident resolves when traffic stops) and `skip` for metrics that need a minimum number of traces (per-trace averages, the three rates, latency). An explicit value always wins.
- **Errored traces vs error rate.** `error_traces` is a count with no minimum number of traces, so it fires on a project with five traces an hour. `error_rate` needs `minTraces` (50) in the window and never fires below that.
- **`no_cost_rate` / `no_tokens_rate`** are the share of traces whose summed cost / token count is zero. They exist to catch cost tracking or token reporting that stopped (a model without a price, an instrumentation change), and need `minTraces` like every rate.
- **Relative conditions** (`change`, `trace_p99`) compare `value / baseline * 100`. A missing or zero baseline skips the check. A difference under `minChange` reads as OK. `trace_p99` thresholds are a percent of the project's p99 trace cost over 7 days, cached for 24 h per rule in Redis (10 minutes while the project has no baseline yet).
- **Spending limit** (`condition.type = "spending_limit"`, `{ limit, warnAtPercent }`). Critical when spend reaches `limit`, Warning when it reaches `warnAtPercent` (default 80, 1 to 99) of it. Both are inclusive, unlike other thresholds. The rule's own `warning` / `critical` / `resolve` must be unset: `Rule::warning_threshold()` / `critical_threshold()` derive them, and the engine has no other special case for it. The window is the last day (rolling 24 h, `{ minutes: 1440 }`) or the month so far (`{ monthToDate: true }`, the UTC calendar month). A monthly limit resolves when the month turns; a daily one steps down as the day rolls on. Monthly limits are checked hourly on a per-rule offset and need `checksInARow` checks, so spend that passes the limit in the last hours of a month can go unreported as Critical.
- **Mute and snooze do not stop evaluation.** State and incidents keep updating with `notify = false`, so an incident can resolve in silence. When a snooze ends on an incident nobody heard about, the next check sends a reminder as its first message. A resolve for an incident nobody heard about stays silent.
- **Reminders back off:** 30 min, 30 min, 1 h, 2 h, … capped at 24 h, restarting when the incident escalates or reopens. They are only sent on a check that was evaluated.
- **Edits reset state.** `Rule::fingerprint()` hashes the fields that change evaluation (not snooze or mute). On a mismatch the states are deleted and open incidents are closed without a message.

## Data

- Unfiltered cost and token sums, and the numerators of per-trace metrics, come from `span_metrics_1m`. Everything else comes from trace rows: `traces_agg` when the rule has no filters, `traces_v0` with the rule's filters otherwise. `series::reads_spans` / `reads_traces` decide.
- **Production traffic only.** Every read leaves out evaluation and playground traces: the rollup view skips their spans, `TRACES_AGG_SOURCE` has a `HAVING` on the seen trace types, and `query::trace_filter` puts `trace_type NOT IN ('EVALUATION', 'PLAYGROUND')` in front of a rule's filters. The one exception is a rule with a filter on `trace_type`: it reads exactly what its filters match.
- A trace is counted in the minute its last stored span ended. Traces are found by start time, looking back 60 minutes before the window (24 h for single-trace cost), so a trace longer than that is missed. A trace still running is counted again in a later window as more spans arrive.
- Filters go through `filters::build_where`, a whitelist of columns and operators with bound values. Never interpolate a filter value.
- Split by model works only for span sums and per-trace metrics without filters. A per-trace metric split by model is the model's sum divided by all of the project's traces in the window (its part of the project's number), because the rollup has no trace count per model. Each check looks at the window's top 20 models, plus any model with an open incident or a running streak.
- `query::fetch_series` reads once per project per tick and serves every due rule of that project.

## Scheduler

- Every consumer replica ticks each minute; the one that takes the Redis lock does the work. `upsert_state` only writes when `last_processed_at` is older than the check, whichever rule version stored the row, and `store::save` rolls the incident back when that guard fails, so two replicas that both evaluate a check still record one transition.
- A rule is checked on a grid: `cadence::is_due(alert_id, interval, minute)` spreads rules over the interval by alert id. The interval comes from the window (`cadence::check_interval_minutes`), never from the user. The preview uses the same grid when it is given the alert id.
- A check looks at the window ending `METRIC_ALERTS_SETTLE_MINUTES` (2) minutes ago. A late tick catches up on at most 10 missed minutes. A last-checked marker more than 10 minutes from the clock, behind or ahead, is dropped (`scheduler::first_minute`); replaying a minute is safe because the engine ignores a check at or before `last_processed_at`.
- **A failed read is not retried.** When `fetch_series` fails for a project, its checks due in that minute are skipped and the marker still moves on, so one project cannot hold up the others. A streak keeps its count, so the rule fires one interval later (up to an hour for a monthly limit).
- **Ingestion backlog.** Producers stamp `accepted_at_ms` on the first message of each span batch and write an "accepted" watermark to Redis; consumers write a "stored up to" watermark after the ClickHouse insert (`ingestion.rs`). When stored trails accepted by more than `METRIC_ALERTS_INGESTION_LAG_SECONDS` (60), checks that could only fire because data is missing are skipped: no-data checks, every `below` rule, and any reading lower than the current level. Data Plane workspaces are not covered.
- State is saved before a transition is handed on, so a crash between the two loses one message instead of sending it twice.

## Preview

`POST /api/v1/projects/{project_id}/metric-alerts/preview` with `{ rule, alertId?, hours? }` replays the rule over up to 7 days (`preview::replay`) and returns the points, the incidents with their transitions, `checkIntervalMinutes`, `firesAfterMinutes` and `firedCount`. An invalid rule returns 400 with the validation message, which is the same `Rule::validate` the scheduler uses.

- **The points are for a chart, the incidents are what the rule does.** A point plots an empty window as 0 whatever `onNoData` says, so a quiet stretch is a flat line and not a gap. Only a relative condition without a baseline has no value.
- **The chart ends at the newest settled minute.** A rule with a 1-day window is checked every 15 minutes and a monthly limit every hour; when the last check is older than the newest settled minute, the window ending there is added as a last point. It is plotted, never evaluated, so incidents still match the scheduler.
- **`firesAfterMinutes` is the longest wait**, interval times checks in a row: the value can cross the line right after a check, so a full interval may pass before the first breaching check. From that first check to the alert it is one interval less, which is what the message's traces link uses.
- **A split rule previews the top 20 models of the whole range.** The scheduler ranks per window, so a model that was in the top 20 only for a while can have incidents the preview does not show.
- More than 600 points are downsampled: each stretch keeps its most extreme value in the rule's direction, and the newest point is always kept as it is.
