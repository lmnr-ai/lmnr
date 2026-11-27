# Metric alerts

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->

Threshold and percent-change rules on a project's traffic, cost, tokens, LLM errors and LLM latency. A rule is a row in `alerts` with `type = 'METRIC'`; the rule itself is the JSON in `alerts.metadata`, and delivery targets are `alert_targets` rows like any other alert. **Every number comes from spans**: there is no trace read anywhere in the feature.

## Storage

- **`span_metrics_1m`** (ClickHouse, migration 90) is a per-minute rollup keyed by `(project_id, minute, model)`. Columns: `span_count` and `span_errors` (every span and every failed span, of any type), summed `total_cost` / `input_tokens` / `output_tokens` / `total_tokens`, and for LLM spans (`span_type = 1`) `llm_calls`, `llm_errors` (`status = 'error'`), `llm_calls_no_cost`, `llm_calls_no_tokens` (zero cost / zero tokens) and `llm_latency_buckets`. The materialized view `span_metrics_1m_mv` fills it from every insert into `spans`, of every span type; a span without a model (most non-LLM spans) lands on the row with model `''`. Readers must `sum()` (`sumMap()` for the buckets) and `GROUP BY`: unmerged parts hold several rows per key.
- **`llm_latency_buckets`** is a histogram, `Map(Int16, UInt64)` merged with `sumMap`: the key is `floor(log(max(duration_ms, 1)) / log(1.05))`, the value the number of LLM calls. A quantile read from it is at most 2.5% off (`ch::span_metrics::LATENCY_BUCKET_BASE`, `series::Sums::llm_latency`). Maps of different minutes and models add up, so a p95 over any window or over all models needs no second query.
- **The rollup holds production traffic only.** The view skips spans whose `trace_type` is evaluation (1) or playground (3). The SDKs and the playground put the trace type on every span of such a trace, so the span's own column is enough. A span that reaches us without it (a custom exporter that only marks the root span) is counted.
- **`minute` is the minute the span ended, not started.** A span is exported when it ends, so its end time is seconds from the insert while its start time is earlier by the whole span duration. Once the spans of a minute are stored, that minute is final: nothing is recounted later, and a window is the plain sum of its minutes, added up in Rust (`series::Series::window`).
- The rollup counts what `spans` holds. A redelivered ingest batch inserts its rows again, and `spans` (plain MergeTree) already counts those twice, so the rollup agrees with it.
- **Nothing is counted per trace.** There is no trace count, errored-trace count, trace duration or cost of one trace. Those need distinct trace ids, which a per-minute sum cannot hold; they would need a separate table.
- The rollup has no rows from before the migration ran. To fill history, run once per deployment (the `created_at` bound keeps rows the view already counted out; it is the time the view was created):

  ```sql
  INSERT INTO span_metrics_1m
  SELECT project_id, toDateTime(toStartOfMinute(end_time), 'UTC') AS minute, model,
         count(), countIf(status = 'error'), sum(spans.total_cost), sum(spans.input_tokens), sum(spans.output_tokens), sum(spans.total_tokens),
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

## Evaluation (`app-server/src/metric_alerts/`)

- **`engine::evaluate(rule, &mut state, observation) -> Option<Transition>` is pure** and is the only place that decides levels, incidents and reminders. The scheduler and the preview both call it, so a rule previews exactly as it will run. Keep IO out of it; add a row to the table test in `engine_tests.rs` for every behaviour change.
- **Checks in a row.** The level moves only after `checksInARow` consecutive checks ask to move it in the same direction, and only as far as all of them agree. A check that agrees with the current level resets the count. A skipped check (no data with `skip`, too few LLM calls) leaves the state untouched and does not break a streak.
- **A window slides.** A 5-minute sum checked every minute still contains a 2-minute burst five checks later. "Checks in a row" absorbs a burst only when the window total stays under the line; a short burst that lifts the whole window over it fires. Longer windows and `minChange` are the tools for that.
- **Windows** are 5, 15 or 30 minutes, 1 hour or 1 day. A `change` rule compares to the same window 5, 15 or 30 minutes, 1 hour, 1 day, 1 week or 30 days earlier.
- **Thresholds.** A breach is strict (`value > warning`), a resolve is inclusive (`value <= resolve`). `resolve` is optional: unset, the rule resolves at its first alerting threshold (warning, or critical when there is no warning), and "checks in a row" is what keeps a value sitting on the line from flapping. While an incident is open only the resolve threshold returns it to OK; a value between resolve and warning holds Warning, or steps Critical down to Warning.
- **No data.** `onNoData` unset means `zero` for counts and sums (a sum over nothing is zero, so "traffic stopped" fires and a cost incident resolves when traffic stops) and `skip` for the rates and latencies, which say nothing over no calls (`Metric::is_sum`). An explicit value always wins.
- **Metrics** (`rule::Metric`): `span_count`, `span_errors`, `span_error_rate` (percent of spans), `total_cost`, `input_tokens`, `output_tokens`, `total_tokens`, `llm_calls`, `llm_errors`, `llm_error_rate`, `llm_no_cost_rate`, `llm_no_tokens_rate` (percent of LLM calls), `llm_latency_p50`, `llm_latency_p95` (seconds).
- **Errors cover every span.** `span_errors` / `span_error_rate` count failed spans of any type, so a failing tool alerts; the `llm_*` error metrics see only LLM calls, which rarely fail on their own. Metrics over every span (`Metric::counts_every_span`) cannot split by model, since most non-LLM spans have none, and their `minCalls` counts spans. Counts have no minimum, so they fire on a quiet project; the rates and latencies need `minCalls` (50) in the window and are skipped below that (`Metric::needs_min_calls`, `Observation::volume`).
- **Missing cost and tokens.** `llm_no_cost_rate` / `llm_no_tokens_rate` are the share of LLM calls whose cost / token count is zero. They catch cost tracking or token reporting that stopped (a model without a price, an instrumentation change), also when only one model of several lost it.
- **Change** (`condition.type = "change"`) compares `value / baseline * 100`, where the baseline is the same window `compareTo` earlier. A missing or zero baseline skips the check. A difference under `minChange` reads as OK.
- **Mute and snooze do not stop evaluation.** State and incidents keep updating with `notify = false`, so an incident can resolve in silence. When a snooze ends on an incident nobody heard about, the next check sends a reminder as its first message. A resolve for an incident nobody heard about stays silent.
- **Reminders back off:** 30 min, 30 min, 1 h, 2 h, … capped at 24 h, restarting when the incident escalates or reopens. They are only sent on a check that was evaluated.
- **Edits reset state.** `Rule::fingerprint()` hashes the fields that change evaluation (not snooze or mute). On a mismatch the states are deleted and open incidents are closed without a message.

## Data

- One query per project per tick: `query::fetch_series` reads `span_metrics_1m` over the merged minute ranges of every due rule (`series::ranges_of`: the window, and the past window of a change rule) and returns a `Series` of per-minute, per-model sums. `series::observe` adds up the minutes of a window.
- **Production traffic only.** The rollup view skips evaluation and playground spans, and nothing else is read.
- **A long span is counted when it ends.** A call that ran 10 minutes is in the minute it ended, with its whole cost and duration. A span still running is not counted yet.
- **There are no rule filters.** The rollup has `project_id`, `minute` and `model` and nothing else to filter on.
- Split by model works for every metric except `span_count` (`Metric::can_split_by_model`), whose spans mostly have no model. Each check looks at the window's top 20 models (by LLM calls for a rate or latency, by the metric otherwise), plus any model with an open incident or a running streak. The `''` row is never a group. A model with no rows in the window and neither of those is not checked, so a `below` rule split by model does not fire for a model that goes silent from one check to the next.

## Scheduler

- Every consumer replica ticks each minute; the one that takes the Redis lock does the work. `upsert_state` only writes when `last_processed_at` is older than the check, whichever rule version stored the row, and `store::save` rolls the incident back when that guard fails, so two replicas that both evaluate a check still record one transition.
- A rule is checked on a grid: `cadence::is_due(alert_id, interval, minute)` spreads rules over the interval by alert id. The interval comes from the window (`cadence::check_interval_minutes`), never from the user. The preview uses the same grid when it is given the alert id.
- **Data clock, not wall clock.** A tick checks windows ending at `target = min(now - METRIC_ALERTS_SETTLE_MINUTES (2), minute(oldest batch in flight) - 1)` (`scheduler::target_minute`). With idle or current consumers that is the wall clock; during a backlog it is the minute the consumers have reached, so alerts come late and never read a half-stored minute.
- **Oldest batch in flight** (`ingestion.rs`). A producer stamps `accepted_at_ms` on the first message of each span batch. A consumer registers the smallest stamp of the batch it takes (`ingestion::begin`) and drops the guard once the spans are stored or the batch failed. One reporter task per process writes the process's oldest stamp every second to `spans_in_flight:{process}` (30 s TTL) and lists the process in the sorted set `spans_in_flight_processes`; it keeps its last value for 10 s after going idle, to cover the gap between two batches, then removes both. The scheduler takes the minimum over the processes whose key is alive (`ingestion::oldest_in_flight`) and fails the tick when Redis cannot be read.
- **What the data clock cannot see.** Spans still in the queue are only covered while some consumer is working on older ones. If no consumer process is alive for more than 30 s, nothing reports and the clock falls back to wall time. A failed batch stops holding the clock until it is redelivered. Data Plane batches never report: those workspaces keep the wall clock.
- **Replay.** Minutes are checked in order, starting after the last-checked marker (`scheduler::replay`): at most 15 per tick, and at most 3 hours back. Older missed minutes are skipped with a warning. A marker more than 10 minutes ahead of the wall clock is dropped. Replaying a minute is safe because the engine ignores a check at or before `last_processed_at`.
- **A check sent 5 minutes or more after its window ended says so** in the message: "This check covers the window ending ... and was sent 47 min late." (`message::delay_note`).
- **Logs.** Every tick logs rules loaded, rules due, the minutes checked and its duration, as a warning above 30 s. An error is logged while the data clock is more than 10 minutes behind the wall clock: alerts wait for ingestion, so they can no longer report a stuck pipeline themselves.
- **A failed read is not retried.** When `fetch_series` fails for a project, its checks due in that minute are skipped and the marker still moves on, so one project cannot hold up the others. A streak keeps its count, so the rule fires one interval later.
- State is saved before a transition is handed on, so a crash between the two loses one message instead of sending it twice.

## Notifications

- A transition with `notify = true` becomes one `NotificationKind::MetricAlert` on the notification queue. `message::build` (pure) writes every word of it once: headline, sentence, detail rows and both link paths. Slack, email and the panel only lay those out, so a wording change is one edit in `metric_alerts/message.rs`.
- **Slack: one thread per incident per channel.** The first message in a channel is posted top-level and its `ts` is stored in `metric_alert_incidents.slack_threads` under the channel id; everything later replies under it. Escalated and reopened replies are also shown in the channel (`reply_broadcast`); de-escalated, resolved and reminders stay in the thread. If the thread's first message was deleted, the next message starts a new thread and replaces the stored `ts`.
- **The stored `ts` is written after the post and a failed write is logged, not retried:** a retry would post the message twice. The cost is that the next message starts a second thread.
- **Email and the panel get opened, escalated, resolved and reopened** (`MetricAlertNotification::is_major`). Reminders and de-escalations are Slack-only.
- Metric alerts take no send lock. The engine already sends one message per transition, and a lock would swallow a resolve that follows an open.
- The Free plan check in `handle_slack` runs before any kind-specific code, so it covers metric alerts.
- "Open traces" covers the window of the first breaching check up to the check that sent the message, sorted by cost. It is a link for the reader, not what the rule counted: the traces page lists traces by start time and the rule counts spans by end time, and the traces page has no model filter, so the link of a split rule is not narrowed to its model. The frontend link (`tracesHref`) is written with nuqs `createSerializer`.
- "Top model" is named only when it says something: an unsplit `above` rule on a count or sum that can be split by model (`message::names_top_model`).
- `SLACK_API_URL` points Slack calls at another base URL. Use it with a local stand-in server to test delivery without a workspace.

## Preview

`POST /api/v1/projects/{project_id}/metric-alerts/preview` with `{ rule, alertId?, hours? }` replays the rule over up to 7 days (`preview::replay`) and returns the points, the incidents with their transitions, `checkIntervalMinutes`, `firesAfterMinutes` and `firedCount`. An invalid rule returns 400 with the validation message, which is the same `Rule::validate` the scheduler uses.

- **The points are for a chart, the incidents are what the rule does.** A point plots an empty window as 0 whatever `onNoData` says, so a quiet stretch is a flat line and not a gap. A relative condition plots 0 when both windows are empty, and has no value only when the window has data and the earlier one has none.
- **The chart ends at the newest settled minute.** A rule with a 1-day window is checked every 15 minutes; when the last check is older than the newest settled minute, the window ending there is added as a last point. It is plotted, never evaluated, so incidents still match the scheduler.
- **`firesAfterMinutes` is the longest wait**, interval times checks in a row: the value can cross the line right after a check, so a full interval may pass before the first breaching check. From that first check to the alert it is one interval less, which is what the message's traces link uses.
- **A split rule previews the top 20 models of the whole range.** The scheduler ranks per window, so a model that was in the top 20 only for a while can have incidents the preview does not show.
- More than 600 points are downsampled: each stretch keeps its most extreme value in the rule's direction, and the newest point is always kept as it is.
