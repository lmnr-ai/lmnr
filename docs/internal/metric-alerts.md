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

## Evaluation (`app-server/src/metric_alerts/`)

- **`engine::evaluate(rule, &mut state, observation) -> Option<Transition>` is pure** and is the only place that decides levels, incidents and reminders. The scheduler and the preview both call it, so a rule previews exactly as it will run. Keep IO out of it; add a row to the table test in `engine_tests.rs` for every behaviour change.
- **Checks in a row.** The level moves only after `checksInARow` consecutive checks ask to move it in the same direction, and only as far as all of them agree. A check that agrees with the current level resets the count. A skipped check (no data with `skip`, too few LLM calls) leaves the state untouched and does not break a streak.
- **A window slides.** A 5-minute sum checked every minute still contains a 2-minute burst five checks later. "Checks in a row" absorbs a burst only when the window total stays under the line; a short burst that lifts the whole window over it fires. Longer windows and `minChange` are the tools for that.
- **Windows** are 5, 15 or 30 minutes, 1 hour or 1 day. A `change` rule compares to the same window 5, 15 or 30 minutes, 1 hour, 1 day, 1 week or 30 days earlier.
- **Thresholds.** A breach is strict (`value > warning`), a resolve is inclusive (`value <= resolve`). `resolve` is optional: unset, the rule resolves at its first alerting threshold (warning, or critical when there is no warning), and "checks in a row" is what keeps a value sitting on the line from flapping. While an incident is open only the resolve threshold returns it to OK; a value between resolve and warning holds Warning, or steps Critical down to Warning.
- **No data.** `onNoData` unset means `zero` for counts and sums (a sum over nothing is zero, so "traffic stopped" fires and a cost incident resolves when traffic stops) and `skip` for the rates and latencies, which say nothing over no calls (`Metric::is_sum`). An explicit value always wins.
- **Metrics** (`rule::Metric`): `span_count`, `total_cost`, `input_tokens`, `output_tokens`, `total_tokens`, `llm_calls`, `llm_errors`, `llm_error_rate`, `llm_no_cost_rate`, `llm_no_tokens_rate` (percent of LLM calls), `llm_latency_p50`, `llm_latency_p95` (seconds).
- **Failed LLM calls vs LLM error rate.** `llm_errors` is a count with no minimum, so it fires on a project with five calls an hour. The rates and latencies need `minCalls` (50) LLM calls in the window and are skipped below that (`Metric::needs_min_calls`, `Observation::volume`).
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

- **The points are for a chart, the incidents are what the rule does.** A point plots an empty window as 0 whatever `onNoData` says, so a quiet stretch is a flat line and not a gap. Only a relative condition without a baseline has no value.
- **The chart ends at the newest settled minute.** A rule with a 1-day window is checked every 15 minutes; when the last check is older than the newest settled minute, the window ending there is added as a last point. It is plotted, never evaluated, so incidents still match the scheduler.
- **`firesAfterMinutes` is the longest wait**, interval times checks in a row: the value can cross the line right after a check, so a full interval may pass before the first breaching check. From that first check to the alert it is one interval less, which is what the message's traces link uses.
- **A split rule previews the top 20 models of the whole range.** The scheduler ranks per window, so a model that was in the top 20 only for a while can have incidents the preview does not show.
- More than 600 points are downsampled: each stretch keeps its most extreme value in the rule's direction, and the newest point is always kept as it is.

## Frontend and CLI

- **`Rule::validate` in the app-server is the only place a rule is accepted.** `POST /api/v1/projects/{project_id}/metric-alerts/validate` with `{ rule }` returns the cadence or a 400 with the message. The UI save, the preview and the CLI write path all go through `parseMetricRule` (`lib/actions/alerts/metric.ts`), which checks the shape with zod and then calls that endpoint. Saving uses `MetricRuleWriteSchema`, which refuses a key a rule does not have (a mistyped key, or `filters` from an earlier design) instead of dropping it; reading stored rules uses the lenient `MetricRuleSchema`. Add a rule constraint in Rust only; the zod schema mirrors field types, not rules.
- `lib/actions/alerts/metric-rule.ts` and `metric-templates.ts` are client-safe (no drizzle). Client components import values only from those; `metric.ts` is server-only.
- **Templates are one list** (`METRIC_ALERT_TEMPLATES`), seven ids in two categories (`TEMPLATE_CATEGORIES`): Spikes (`cost-spike`, `llm-error-spike`, `llm-error-rate`, `slow-llm-calls`) and Missing data (`traffic-stopped`, `cost-tracking-stopped`, `token-usage-missing`). The sheet shows them in category tabs and turns them into form values; the CLI write API takes the same ids in `template`. No template sets `resolve`.
- **Suggested thresholds.** A template's `suggest` field holds multiples of the project's usual peak; only `slow-llm-calls` has one. The sheet fills it in (`suggestions.ts`, `use-template-suggestions.ts`): when a new-alert sheet opens, one preview call per suggestable template replays the last 7 days with a rule that never fires (`probeRule`), the usual peak is the median of each day's highest value, and the threshold is that peak times the multiple, rounded up to a round number and never below the number the template already has. The numbers are filled in when a template is picked and shown on its card; the form does not offer them again after that. Suggestions exist only in the UI.
- Read routes: `/api/projects/[projectId]/alerts/metric` (list with status; each card's small chart calls `/preview` for 6 h), `/[alertId]` (detail with incidents), `/preview`, `/validate`. Writes reuse the existing alert routes with `type: "METRIC"`: create, update, delete, mute (`toggleDisabled`) and the `snooze` PATCH action. `source_id` holds the project id because a metric alert watches no signal.
- **CLI body** on `/api/internal/projects/:projectId/alerts`: `{ type: "METRIC", name?, template?, rule?, disabled?, notifyMe?, slackChannels? }`. `rule` is merged key by key over the template on create and over the stored rule on update, under the row lock (`mergeRulePatch`; `condition` merges one level down so its `type` survives a partial patch). A patch without `rule` or `disabled` does not re-check the rule. The CLI lists rules through SQL over `alerts`; states and incidents are not exposed to SQL.
- The form (`components/settings/alerts/metric-alerts/metric-alert-sheet/`) keeps numbers as text and converts in `form-rule.ts` (`toRule` / `fromRule`). An empty threshold is `null`, never `0`. Resolve sits under Advanced and is `null` unless typed, so the engine follows the warning threshold. A new change rule compares with 15 minutes earlier (`DEFAULT_FORM_VALUES.compareTo`); a template that names its own comparison keeps it.
- **`METRIC_META` (`constants.ts`) mirrors the Rust metric rules for the form**: `splittable` (everything but `span_count`) shows the split-by-model switch, and `needsMinCalls` (rates and latencies) shows the minimum LLM calls under Advanced. The app-server still decides; these only hide fields that would be refused or ignored.
- **`alertsWhen` (`utils.ts`) is the one sentence that reads a rule back** ("Alerts when ..."). The condition and preview steps both render it through `RuleSentence`. `conditionSummary` is the shorter line on a card and the alert page.
- **The list is a grid of cards** (`metric-alert-card.tsx`). Cards in a row share a height because the grid stretches them and each card is `h-full` with a summary clamped to two lines. Mute lives in the card menu.
- **Charts refetch every minute** (`REFRESH_MS`), as does the list. The alert page's range (`?range=1h|6h|24h|7d`, default `6h`, nuqs) picks the preview `hours`; cards always ask for 6 h.
- The sheet's footer button is "Next" (`type="button"`) or "Save" (`type="submit"`) in the same place. They carry different `key`s: without them React reuses the DOM node, and the click that turns "Next" into "Save" submits the form.
- The alert page's shaded spans come from the preview (a replay of the current rule), not from `metric_alert_incidents`: an incident row keeps its first open, last reopen and resolve times, not every stretch it was open.
- The alert page takes the cadence from the validate endpoint (`useRuleCheck`), not from the preview: the replay can be slow or fail, and an incident's "Open traces" range needs `firesAfterMinutes`. Until it is known, `incidentTracesHref` returns `null` and no link is shown. With no open incident the header link (`currentTracesHref`) covers what the rule is counting: the last day. SWR stops its `refreshInterval` while the last answer is an error, and these hooks turn the default error retry off (a refused rule must not be retried in the form), so `polling()` in `use-rule-requests.ts` retries at the refresh pace for the page that stays open. Without it one failed call hides the links and the chart until a reload.
- After an edit the row can show the previous level for up to one check interval: the state is reset by the scheduler at the rule's next check, not by the save.
- **Dashboard "Create alert"** appears only when `chartAlertPreset` (`components/dashboards/chart-alert.ts`) matches the chart to one of the three supported presets. Charts carry no preset marker, so the match is by query structure, or by normalized SQL for the default charts seeded without one. An edited preset stops matching, which is the intent. `settings` is not validated on read, so a structure that fails `QueryStructureSchema` is ignored and the chart is matched by its SQL.
- Chart reference lines: `ChartContainer` forces `stroke-border` on every reference line through CSS, so threshold lines set their colour with inline `style`, not the `stroke` prop.
- The Slack "Send test" in the sheet posts a sample metric alert message. There is no email test send.
- Plans: metric alerts are not gated. Free workspaces get email and the panel; the sheet shows a line instead of the Slack channel picker (`useSlackAvailable`), and `handle_slack` drops Slack at delivery.
