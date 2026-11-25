//! Per-minute numbers and the window math on top of them. Pure: the scheduler
//! and the preview build the same `Observation` from the same rows.

use std::collections::{BTreeMap, HashMap};

use chrono::{DateTime, Datelike, Months, TimeZone, Utc};

use crate::ch::span_metrics::SpanMetricsMinute;

use super::{
    engine::Observation,
    query::TraceMinute,
    rule::{Condition, MAX_GROUPS, Metric, Rule, Window},
};

/// Latency histogram buckets grow by 5%, so a quantile is off by at most 2.5%.
pub const LATENCY_BUCKET_BASE: f64 = 1.05;
const BUDGET_PACE_DAYS: i64 = 7;
const MINUTES_PER_DAY: i64 = 1440;
/// The model the ingestion pipeline stores for spans that have none.
const NULL_MODEL: &str = "<null>";

/// Half-open range of unix minutes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Minutes {
    pub start: i64,
    pub end: i64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct SpanSums {
    pub cost: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
}

impl SpanSums {
    fn add(&mut self, other: &SpanSums) {
        self.cost += other.cost;
        self.input_tokens += other.input_tokens;
        self.output_tokens += other.output_tokens;
        self.total_tokens += other.total_tokens;
    }

    fn metric(&self, metric: Metric) -> f64 {
        match metric {
            Metric::InputTokens => self.input_tokens as f64,
            Metric::OutputTokens => self.output_tokens as f64,
            Metric::TotalTokens | Metric::TokensPerTrace => self.total_tokens as f64,
            _ => self.cost,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct TraceSums {
    pub traces: u64,
    pub error_traces: u64,
    pub sums: SpanSums,
    pub max_cost: f64,
    /// Latency histogram bucket to trace count.
    pub durations: BTreeMap<i32, u64>,
}

impl TraceSums {
    fn add(&mut self, other: &TraceSums) {
        self.traces += other.traces;
        self.error_traces += other.error_traces;
        self.sums.add(&other.sums);
        self.max_cost = self.max_cost.max(other.max_cost);
        for (bucket, count) in &other.durations {
            *self.durations.entry(*bucket).or_default() += count;
        }
    }

    /// Latency quantile in seconds.
    fn latency(&self, quantile: f64) -> Option<f64> {
        let total: u64 = self.durations.values().sum();
        let rank = (quantile * total as f64).ceil().max(1.0) as u64;
        let mut seen = 0;
        for (bucket, count) in &self.durations {
            seen += count;
            if seen >= rank {
                let millis = LATENCY_BUCKET_BASE.powf(*bucket as f64 + 0.5);
                return Some(millis / 1000.0);
            }
        }
        None
    }
}

/// Everything read for one rule, keyed by unix minute. Spans are bucketed by
/// the minute they ended, traces by the minute of their last span so far.
#[derive(Debug, Clone, Default)]
pub struct Series {
    pub spans: BTreeMap<i64, HashMap<String, SpanSums>>,
    pub traces: BTreeMap<i64, TraceSums>,
}

impl Series {
    pub fn add_span_rows(&mut self, rows: &[SpanMetricsMinute]) {
        for row in rows {
            let sums = SpanSums {
                cost: row.total_cost,
                input_tokens: row.input_tokens,
                output_tokens: row.output_tokens,
                total_tokens: row.total_tokens,
            };
            self.spans
                .entry(row.minute as i64 / 60)
                .or_default()
                .entry(row.model.clone())
                .or_default()
                .add(&sums);
        }
    }

    pub fn add_trace_rows(&mut self, rows: &[TraceMinute]) {
        for row in rows {
            let mut sums = TraceSums {
                traces: row.traces,
                error_traces: row.error_traces,
                sums: SpanSums {
                    cost: row.total_cost,
                    input_tokens: row.input_tokens,
                    output_tokens: row.output_tokens,
                    total_tokens: row.total_tokens,
                },
                max_cost: row.max_cost,
                durations: BTreeMap::new(),
            };
            sums.durations.insert(row.bucket, row.traces);
            self.traces
                .entry(row.minute as i64 / 60)
                .or_default()
                .add(&sums);
        }
    }

    /// Span sums in a window, for one model or for all. `None` without spans.
    fn span_window(&self, group: Option<&str>, window: Minutes) -> Option<SpanSums> {
        let mut total: Option<SpanSums> = None;
        for models in self.spans.range(window.start..window.end).map(|(_, m)| m) {
            for (model, sums) in models {
                if group.is_none_or(|g| g == model) {
                    total.get_or_insert_default().add(sums);
                }
            }
        }
        total
    }

    fn trace_window(&self, window: Minutes) -> Option<TraceSums> {
        let mut total: Option<TraceSums> = None;
        for sums in self.traces.range(window.start..window.end).map(|(_, s)| s) {
            total.get_or_insert_default().add(sums);
        }
        total
    }

    /// The models with the most of the rule's metric in the window, capped at
    /// `MAX_GROUPS`.
    pub fn top_models(&self, rule: &Rule, window: Minutes) -> Vec<String> {
        let mut totals: HashMap<&str, SpanSums> = HashMap::new();
        for models in self.spans.range(window.start..window.end).map(|(_, m)| m) {
            for (model, sums) in models {
                if !model.is_empty() && model != NULL_MODEL {
                    totals.entry(model).or_default().add(sums);
                }
            }
        }
        let mut ranked: Vec<(&str, f64)> = totals
            .into_iter()
            .map(|(model, sums)| (model, sums.metric(rule.metric)))
            .collect();
        ranked.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(b.0)));
        ranked.truncate(MAX_GROUPS);
        ranked
            .into_iter()
            .map(|(model, _)| model.to_string())
            .collect()
    }

    /// The model behind the largest part of an unsplit rule's number.
    pub fn top_contributor(&self, rule: &Rule, window: Minutes) -> Option<Contributor> {
        let total = self.span_window(None, window)?.metric(rule.metric);
        let model = self.top_models(rule, window).into_iter().next()?;
        let value = self.span_window(Some(&model), window)?.metric(rule.metric);
        (total > 0.0 && value > 0.0).then(|| Contributor {
            model,
            share: value / total,
        })
    }
}

/// A model and its share (0 to 1) of a window's total.
#[derive(Debug, Clone, PartialEq)]
pub struct Contributor {
    pub model: String,
    pub share: f64,
}

/// Unfiltered cost and token sums come from the span rollup. Everything else
/// is a trace-level number.
pub fn reads_spans(rule: &Rule) -> bool {
    rule.filters.is_empty() && (rule.metric.is_span_sum() || rule.metric.is_per_trace())
}

pub fn reads_traces(rule: &Rule) -> bool {
    !reads_spans(rule) || rule.metric.is_per_trace()
}

struct Measured {
    value: Option<f64>,
    traces: u64,
}

fn measure(rule: &Rule, series: &Series, group: Option<&str>, window: Minutes) -> Measured {
    let traces = series.trace_window(window);
    let trace_count = traces.as_ref().map(|t| t.traces).unwrap_or(0);
    let sums = if reads_spans(rule) {
        series.span_window(group, window)
    } else {
        traces.as_ref().map(|t| t.sums)
    };
    let value = match rule.metric {
        Metric::TotalCost | Metric::InputTokens | Metric::OutputTokens | Metric::TotalTokens => {
            sums.map(|s| s.metric(rule.metric))
        }
        Metric::CostPerTrace | Metric::TokensPerTrace => sums
            .filter(|_| trace_count > 0)
            .map(|s| s.metric(rule.metric) / trace_count as f64),
        Metric::TraceCost => traces.map(|t| t.max_cost),
        Metric::TraceCount => traces.map(|t| t.traces as f64),
        Metric::ErrorRate => traces.map(|t| t.error_traces as f64 / t.traces as f64 * 100.0),
        Metric::LatencyP50 => traces.and_then(|t| t.latency(0.5)),
        Metric::LatencyP95 => traces.and_then(|t| t.latency(0.95)),
    };
    Measured {
        value,
        traces: trace_count,
    }
}

fn minute_of(at: DateTime<Utc>) -> i64 {
    at.timestamp().div_euclid(60)
}

pub fn time_of(minute: i64) -> DateTime<Utc> {
    Utc.timestamp_opt(minute * 60, 0)
        .single()
        .unwrap_or_default()
}

/// Start of the UTC month that `minute` falls in, and of the month after.
fn month_bounds(minute: i64) -> (i64, i64) {
    let at = time_of(minute);
    let start = Utc
        .with_ymd_and_hms(at.year(), at.month(), 1, 0, 0, 0)
        .single()
        .unwrap_or(at);
    let next = start.checked_add_months(Months::new(1)).unwrap_or(start);
    (minute_of(start), minute_of(next))
}

/// The window a check ending at `end` measures.
pub fn window_of(rule: &Rule, end: i64) -> Minutes {
    let start = match rule.window {
        Window::Minutes { minutes } => end - minutes as i64,
        // The first check of a month still closes the month that just ended.
        Window::MonthToDate { .. } => month_bounds(end - 1).0,
    };
    Minutes { start, end }
}

/// Every range of minutes a check ending at `end` reads.
pub fn ranges_of(rule: &Rule, end: i64) -> Vec<Minutes> {
    let window = window_of(rule, end);
    let mut ranges = vec![window];
    match rule.condition {
        Condition::Change { compare_to } => {
            let shift = compare_to.minutes();
            ranges.push(Minutes {
                start: window.start - shift,
                end: window.end - shift,
            });
        }
        Condition::Budget { .. } => ranges.push(Minutes {
            start: end - BUDGET_PACE_DAYS * MINUTES_PER_DAY,
            end,
        }),
        _ => {}
    }
    ranges
}

/// Sorts ranges and joins the ones that touch or overlap.
pub fn merge_ranges(mut ranges: Vec<Minutes>) -> Vec<Minutes> {
    ranges.sort();
    let mut merged: Vec<Minutes> = Vec::with_capacity(ranges.len());
    for range in ranges {
        match merged.last_mut() {
            Some(last) if range.start <= last.end => last.end = last.end.max(range.end),
            _ => merged.push(range),
        }
    }
    merged
}

/// What the scheduler knows beyond the series.
#[derive(Debug, Clone, Copy, Default)]
pub struct Context {
    /// The project's p99 trace cost, for `trace_p99` rules.
    pub trace_cost_p99: Option<f64>,
    pub ingestion_behind: bool,
}

/// Builds the check of one rule and group for the window ending at `end`.
pub fn observe(
    rule: &Rule,
    series: &Series,
    group: Option<&str>,
    end: i64,
    context: Context,
) -> Observation {
    let window = window_of(rule, end);
    let measured = measure(rule, series, group, window);

    let baseline = match rule.condition {
        Condition::Change { compare_to } => {
            let shift = compare_to.minutes();
            let past = Minutes {
                start: window.start - shift,
                end: window.end - shift,
            };
            measure(rule, series, group, past).value
        }
        Condition::TraceP99 => context.trace_cost_p99,
        _ => None,
    };

    let projected = match rule.condition {
        Condition::Budget { .. } => {
            let pace_window = Minutes {
                start: end - BUDGET_PACE_DAYS * MINUTES_PER_DAY,
                end,
            };
            let recent = measure(rule, series, group, pace_window)
                .value
                .unwrap_or(0.0);
            let daily = recent / BUDGET_PACE_DAYS as f64;
            let days_left = (month_bounds(end - 1).1 - end) as f64 / MINUTES_PER_DAY as f64;
            Some(measured.value.unwrap_or(0.0) + daily * days_left.max(0.0))
        }
        _ => None,
    };

    Observation {
        at: time_of(end),
        value: measured.value,
        baseline,
        projected,
        traces: measured.traces,
        ingestion_behind: context.ingestion_behind,
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;
    use serde_json::{Value, json};

    use super::*;

    fn rule(fields: Value) -> Rule {
        let mut rule = json!({
            "metric": "total_cost",
            "window": { "minutes": 5 },
            "condition": { "type": "value" },
            "warning": 100,
            "resolve": 80
        });
        if let (Some(rule), Some(fields)) = (rule.as_object_mut(), fields.as_object()) {
            rule.extend(fields.clone());
        }
        Rule::parse(&rule).unwrap()
    }

    fn span_row(minute: i64, model: &str, cost: f64, tokens: i64) -> SpanMetricsMinute {
        SpanMetricsMinute {
            minute: (minute * 60) as u32,
            model: model.to_string(),
            total_cost: cost,
            input_tokens: tokens,
            output_tokens: tokens,
            total_tokens: tokens * 2,
            llm_calls: 1,
        }
    }

    fn trace_row(minute: i64, bucket: i32, traces: u64, errors: u64, cost: f64) -> TraceMinute {
        TraceMinute {
            minute: (minute * 60) as u32,
            bucket,
            traces,
            error_traces: errors,
            total_cost: cost,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            max_cost: cost / traces.max(1) as f64,
        }
    }

    fn minute_at(year: i32, month: u32, day: u32) -> i64 {
        minute_of(Utc.with_ymd_and_hms(year, month, day, 0, 0, 0).unwrap())
    }

    #[test]
    fn a_window_sums_its_own_minutes_only() {
        let mut series = Series::default();
        series.add_span_rows(&[
            span_row(94, "a", 1000.0, 0),
            span_row(95, "a", 1.0, 10),
            span_row(99, "b", 2.0, 20),
            span_row(100, "a", 1000.0, 0),
        ]);

        let cost = observe(&rule(json!({})), &series, None, 100, Context::default());
        assert_eq!(cost.at, time_of(100));
        assert_eq!(cost.value, Some(3.0));

        let tokens = rule(json!({ "metric": "total_tokens" }));
        let observed = observe(&tokens, &series, None, 100, Context::default());
        assert_eq!(observed.value, Some(60.0));

        let empty = observe(&rule(json!({})), &series, None, 200, Context::default());
        assert_eq!(empty.value, None);
    }

    #[test]
    fn a_split_rule_measures_one_model() {
        let mut series = Series::default();
        series.add_span_rows(&[
            span_row(95, "a", 1.0, 0),
            span_row(96, "b", 5.0, 0),
            span_row(97, "", 50.0, 0),
            span_row(97, NULL_MODEL, 50.0, 0),
        ]);
        let rule = rule(json!({ "groupBy": "model" }));

        let observed = observe(&rule, &series, Some("b"), 100, Context::default());
        assert_eq!(observed.value, Some(5.0));
        let window = window_of(&rule, 100);
        assert_eq!(series.top_models(&rule, window), vec!["b", "a"]);
    }

    #[test]
    fn the_top_contributor_is_the_model_with_the_largest_share() {
        let rule = rule(json!({ "metric": "total_cost" }));
        let mut series = Series::default();
        series.add_span_rows(&[
            span_row(10, "model-a", 1.0, 10),
            span_row(10, "model-b", 3.0, 10),
            span_row(11, "", 4.0, 10),
        ]);
        let window = Minutes { start: 10, end: 12 };

        let top = series.top_contributor(&rule, window).unwrap();
        assert_eq!(top.model, "model-b");
        assert_eq!(top.share, 3.0 / 8.0);
        assert!(
            Series::default().top_contributor(&rule, window).is_none(),
            "nothing to name without spans"
        );
    }

    #[test]
    fn at_most_20_models_are_checked() {
        let rows: Vec<SpanMetricsMinute> = (0..30)
            .map(|i| span_row(95, &format!("model-{i:02}"), i as f64, 0))
            .collect();
        let mut series = Series::default();
        series.add_span_rows(&rows);
        let rule = rule(json!({ "groupBy": "model" }));

        let models = series.top_models(&rule, window_of(&rule, 100));
        assert_eq!(models.len(), MAX_GROUPS);
        assert_eq!(models.first().map(String::as_str), Some("model-29"));
        assert_eq!(models.last().map(String::as_str), Some("model-10"));
    }

    #[test]
    fn change_reads_the_same_window_shifted_back() {
        let week = 7 * MINUTES_PER_DAY;
        let end = 100 + week;
        let mut series = Series::default();
        series.add_span_rows(&[span_row(96, "a", 4.0, 0), span_row(end - 2, "a", 6.0, 0)]);
        let rule = rule(json!({
            "condition": { "type": "change", "compareTo": "1w" }, "warning": 130, "resolve": 120
        }));

        let observed = observe(&rule, &series, None, end, Context::default());
        assert_eq!(observed.value, Some(6.0));
        assert_eq!(observed.baseline, Some(4.0));
        assert_eq!(
            ranges_of(&rule, end),
            vec![
                Minutes {
                    start: end - 5,
                    end
                },
                Minutes {
                    start: 95,
                    end: 100
                }
            ]
        );

        // Nothing a week before this window.
        let later = observe(&rule, &series, None, end + 3, Context::default());
        assert_eq!(later.baseline, None);
    }

    #[test]
    fn trace_metrics_come_from_traces() {
        let mut series = Series::default();
        series.add_span_rows(&[span_row(96, "a", 30.0, 300)]);
        // 80 traces at about 1 s, 20 at about 10 s.
        let fast = (1000f64.ln() / LATENCY_BUCKET_BASE.ln()).floor() as i32;
        let slow = (10000f64.ln() / LATENCY_BUCKET_BASE.ln()).floor() as i32;
        series.add_trace_rows(&[
            trace_row(96, fast, 80, 0, 8.0),
            trace_row(97, slow, 20, 5, 40.0),
        ]);
        let observed = |fields: Value| {
            let rule = rule(fields);
            observe(&rule, &series, None, 100, Context::default())
        };

        assert_eq!(
            observed(json!({ "metric": "trace_count" })).value,
            Some(100.0)
        );
        assert_eq!(observed(json!({ "metric": "error_rate" })).value, Some(5.0));
        assert_eq!(observed(json!({ "metric": "error_rate" })).traces, 100);
        // Unfiltered per-trace numbers divide the span sums by the traces.
        assert_eq!(
            observed(json!({ "metric": "cost_per_trace" })).value,
            Some(0.3)
        );
        assert_eq!(
            observed(json!({ "metric": "tokens_per_trace" })).value,
            Some(6.0)
        );
        assert_eq!(observed(json!({ "metric": "trace_cost" })).value, Some(2.0));

        let p50 = observed(json!({ "metric": "latency_p50" })).value.unwrap();
        let p95 = observed(json!({ "metric": "latency_p95" })).value.unwrap();
        assert!((p50 - 1.0).abs() < 0.05, "p50 {p50}");
        assert!((p95 - 10.0).abs() < 0.5, "p95 {p95}");
    }

    #[test]
    fn a_filtered_rule_reads_everything_from_traces() {
        let mut series = Series::default();
        series.add_trace_rows(&[trace_row(96, 0, 4, 0, 8.0)]);
        let filters = json!([{ "column": "user_id", "operator": "eq", "value": "u1" }]);
        let rule = rule(json!({ "filters": filters }));

        assert!(!reads_spans(&rule) && reads_traces(&rule));
        let observed = observe(&rule, &series, None, 100, Context::default());
        assert_eq!(observed.value, Some(8.0));
    }

    #[test]
    fn a_budget_projects_the_month_from_the_last_7_days() {
        let rule = rule(json!({
            "window": { "monthToDate": true },
            "condition": { "type": "budget", "amount": 2000 },
            "warning": null,
            "resolve": null
        }));
        let end = minute_at(2026, 11, 15);
        let mut series = Series::default();
        series.add_span_rows(&[
            // Last month does not count towards the spend.
            span_row(minute_at(2026, 10, 31), "a", 5000.0, 0),
            span_row(minute_at(2026, 11, 2), "a", 300.0, 0),
            span_row(minute_at(2026, 11, 10), "a", 700.0, 0),
        ]);

        let observed = observe(&rule, &series, None, end, Context::default());
        assert_eq!(observed.value, Some(1000.0));
        // 700 in the last 7 days is 100 a day, with 16 days left.
        assert_eq!(observed.projected, Some(2600.0));

        // The first check of December still closes November.
        let month_end = minute_at(2026, 12, 1);
        let closing = observe(&rule, &series, None, month_end, Context::default());
        assert_eq!(closing.value, Some(1000.0));
        assert_eq!(closing.projected, Some(1000.0));
        assert_eq!(window_of(&rule, month_end + 1).start, month_end);
    }

    #[test]
    fn ranges_merge_when_they_touch() {
        let ranges = vec![
            Minutes { start: 10, end: 20 },
            Minutes { start: 0, end: 5 },
            Minutes { start: 20, end: 30 },
            Minutes { start: 12, end: 14 },
        ];
        assert_eq!(
            merge_ranges(ranges),
            vec![Minutes { start: 0, end: 5 }, Minutes { start: 10, end: 30 }]
        );
    }
}
