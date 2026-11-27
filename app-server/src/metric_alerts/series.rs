//! Per-minute numbers and the window math on top of them. Pure: the scheduler
//! and the preview build the same `Observation` from the same rows.

use std::collections::{BTreeMap, HashMap};

use chrono::{DateTime, TimeZone, Utc};

use crate::ch::span_metrics::{LATENCY_BUCKET_BASE, SpanMetricsMinute};

use super::{
    engine::Observation,
    rule::{Condition, MAX_GROUPS, Metric, Rule},
};

/// The model the ingestion pipeline stores for spans that have none.
const NULL_MODEL: &str = "<null>";

/// Half-open range of unix minutes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Minutes {
    pub start: i64,
    pub end: i64,
}

/// What the rollup holds for one model. A stored minute is final, so the sums
/// of a window are the sums of its minutes.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Sums {
    pub spans: u64,
    pub cost: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub llm_calls: u64,
    pub llm_errors: u64,
    pub llm_calls_no_cost: u64,
    pub llm_calls_no_tokens: u64,
    /// LLM call durations: histogram bucket to call count.
    pub llm_latency: BTreeMap<i16, u64>,
}

impl Sums {
    fn add(&mut self, other: &Sums) {
        self.spans += other.spans;
        self.cost += other.cost;
        self.input_tokens += other.input_tokens;
        self.output_tokens += other.output_tokens;
        self.total_tokens += other.total_tokens;
        self.llm_calls += other.llm_calls;
        self.llm_errors += other.llm_errors;
        self.llm_calls_no_cost += other.llm_calls_no_cost;
        self.llm_calls_no_tokens += other.llm_calls_no_tokens;
        for (bucket, count) in &other.llm_latency {
            *self.llm_latency.entry(*bucket).or_default() += count;
        }
    }

    fn percent_of_llm_calls(&self, count: u64) -> Option<f64> {
        (self.llm_calls > 0).then(|| count as f64 / self.llm_calls as f64 * 100.0)
    }

    /// LLM call duration quantile in seconds.
    fn llm_latency(&self, quantile: f64) -> Option<f64> {
        let total: u64 = self.llm_latency.values().sum();
        let rank = (quantile * total as f64).ceil().max(1.0) as u64;
        let mut seen = 0;
        for (bucket, count) in &self.llm_latency {
            seen += count;
            if seen >= rank {
                let millis = LATENCY_BUCKET_BASE.powf(*bucket as f64 + 0.5);
                return Some(millis / 1000.0);
            }
        }
        None
    }

    /// The rule's number. `None` for a rate or a latency without LLM calls.
    fn metric(&self, metric: Metric) -> Option<f64> {
        match metric {
            Metric::SpanCount => Some(self.spans as f64),
            Metric::TotalCost => Some(self.cost),
            Metric::InputTokens => Some(self.input_tokens as f64),
            Metric::OutputTokens => Some(self.output_tokens as f64),
            Metric::TotalTokens => Some(self.total_tokens as f64),
            Metric::LlmCalls => Some(self.llm_calls as f64),
            Metric::LlmErrors => Some(self.llm_errors as f64),
            Metric::LlmErrorRate => self.percent_of_llm_calls(self.llm_errors),
            Metric::LlmNoCostRate => self.percent_of_llm_calls(self.llm_calls_no_cost),
            Metric::LlmNoTokensRate => self.percent_of_llm_calls(self.llm_calls_no_tokens),
            Metric::LlmLatencyP50 => self.llm_latency(0.5),
            Metric::LlmLatencyP95 => self.llm_latency(0.95),
        }
    }
}

/// The rollup rows read for a project, keyed by unix minute and model. Spans
/// are bucketed by the minute they ended.
#[derive(Debug, Clone, Default)]
pub struct Series {
    minutes: BTreeMap<i64, HashMap<String, Sums>>,
}

impl Series {
    pub fn add_rows(&mut self, rows: &[SpanMetricsMinute]) {
        for row in rows {
            let sums = Sums {
                spans: row.span_count,
                cost: row.total_cost,
                input_tokens: row.input_tokens,
                output_tokens: row.output_tokens,
                total_tokens: row.total_tokens,
                llm_calls: row.llm_calls,
                llm_errors: row.llm_errors,
                llm_calls_no_cost: row.llm_calls_no_cost,
                llm_calls_no_tokens: row.llm_calls_no_tokens,
                llm_latency: row.llm_latency_buckets.iter().copied().collect(),
            };
            self.minutes
                .entry(row.minute as i64 / 60)
                .or_default()
                .entry(row.model.clone())
                .or_default()
                .add(&sums);
        }
    }

    /// Sums of a window, for one model or for all. `None` without spans.
    fn window(&self, group: Option<&str>, window: Minutes) -> Option<Sums> {
        let mut total: Option<Sums> = None;
        for models in self.minutes.range(window.start..window.end).map(|(_, m)| m) {
            for (model, sums) in models {
                if group.is_none_or(|g| g == model) {
                    total.get_or_insert_default().add(sums);
                }
            }
        }
        total
    }

    /// The models with the most of the rule's metric in the window, capped at
    /// `MAX_GROUPS`. For a rate or a latency, the models with the most LLM
    /// calls, leaving out the ones without any.
    pub fn top_models(&self, rule: &Rule, window: Minutes) -> Vec<String> {
        let mut totals: HashMap<&str, Sums> = HashMap::new();
        for models in self.minutes.range(window.start..window.end).map(|(_, m)| m) {
            for (model, sums) in models {
                if !model.is_empty() && model != NULL_MODEL {
                    totals.entry(model).or_default().add(sums);
                }
            }
        }
        let by_llm_calls = !rule.metric.is_sum();
        let mut ranked: Vec<(&str, f64)> = totals
            .into_iter()
            .filter(|(_, sums)| !by_llm_calls || sums.llm_calls > 0)
            .map(|(model, sums)| match by_llm_calls {
                true => (model, sums.llm_calls as f64),
                false => (model, sums.metric(rule.metric).unwrap_or(0.0)),
            })
            .collect();
        ranked.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(b.0)));
        ranked.truncate(MAX_GROUPS);
        ranked
            .into_iter()
            .map(|(model, _)| model.to_string())
            .collect()
    }

    /// The model behind the largest part of an unsplit rule's sum.
    pub fn top_contributor(&self, rule: &Rule, window: Minutes) -> Option<Contributor> {
        let total = self.window(None, window)?.metric(rule.metric)?;
        let model = self.top_models(rule, window).into_iter().next()?;
        let value = self.window(Some(&model), window)?.metric(rule.metric)?;
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

struct Measured {
    value: Option<f64>,
    /// What `min_calls` is compared to.
    llm_calls: u64,
}

fn measure(rule: &Rule, series: &Series, group: Option<&str>, window: Minutes) -> Measured {
    let sums = series.window(group, window);
    Measured {
        value: sums.as_ref().and_then(|s| s.metric(rule.metric)),
        llm_calls: sums.map(|s| s.llm_calls).unwrap_or(0),
    }
}

pub fn time_of(minute: i64) -> DateTime<Utc> {
    Utc.timestamp_opt(minute * 60, 0)
        .single()
        .unwrap_or_default()
}

/// The window a check ending at `end` measures.
pub fn window_of(rule: &Rule, end: i64) -> Minutes {
    Minutes {
        start: end - rule.window.minutes as i64,
        end,
    }
}

/// Every range of minutes a check ending at `end` reads.
pub fn ranges_of(rule: &Rule, end: i64) -> Vec<Minutes> {
    let window = window_of(rule, end);
    let mut ranges = vec![window];
    if let Condition::Change { compare_to } = rule.condition {
        let shift = compare_to.minutes();
        ranges.push(Minutes {
            start: window.start - shift,
            end: window.end - shift,
        });
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
        Condition::Value => None,
    };

    Observation {
        at: time_of(end),
        value: measured.value,
        baseline,
        volume: measured.llm_calls,
        ingestion_behind: context.ingestion_behind,
    }
}

#[cfg(test)]
mod tests {
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

    /// One LLM call with a cost and tokens.
    fn row(minute: i64, model: &str, cost: f64, tokens: i64) -> SpanMetricsMinute {
        SpanMetricsMinute {
            minute: (minute * 60) as u32,
            model: model.to_string(),
            span_count: 1,
            total_cost: cost,
            input_tokens: tokens,
            output_tokens: tokens,
            total_tokens: tokens * 2,
            llm_calls: 1,
            llm_errors: 0,
            llm_calls_no_cost: 0,
            llm_calls_no_tokens: 0,
            llm_latency_buckets: vec![],
        }
    }

    fn bucket(millis: f64) -> i16 {
        (millis.ln() / LATENCY_BUCKET_BASE.ln()).floor() as i16
    }

    fn observed(series: &Series, fields: Value, group: Option<&str>, end: i64) -> Observation {
        observe(&rule(fields), series, group, end, Context::default())
    }

    #[test]
    fn a_window_sums_its_own_minutes_only() {
        let mut series = Series::default();
        series.add_rows(&[
            row(94, "a", 1000.0, 0),
            row(95, "a", 1.0, 10),
            row(99, "b", 2.0, 20),
            row(100, "a", 1000.0, 0),
        ]);

        let cost = observed(&series, json!({}), None, 100);
        assert_eq!(cost.at, time_of(100));
        assert_eq!(cost.value, Some(3.0));
        let tokens = observed(&series, json!({ "metric": "total_tokens" }), None, 100);
        assert_eq!(tokens.value, Some(60.0));
        assert_eq!(observed(&series, json!({}), None, 200).value, None);
    }

    #[test]
    fn the_span_count_includes_spans_that_are_not_llm_calls() {
        let other = |minute: i64, spans: u64| SpanMetricsMinute {
            span_count: spans,
            llm_calls: 0,
            ..row(minute, "", 0.0, 0)
        };
        let mut series = Series::default();
        series.add_rows(&[other(96, 40), row(97, "a", 1.0, 10), other(98, 2)]);

        let spans = observed(&series, json!({ "metric": "span_count" }), None, 100);
        assert_eq!(spans.value, Some(43.0));
        let calls = observed(&series, json!({ "metric": "llm_calls" }), None, 100);
        assert_eq!(calls.value, Some(1.0));
        // No spans at all: nothing to report, and the rule's no-data mode decides.
        let quiet = observed(&series, json!({ "metric": "span_count" }), None, 200);
        assert_eq!(quiet.value, None);
    }

    #[test]
    fn a_split_rule_measures_one_model() {
        let mut series = Series::default();
        series.add_rows(&[
            row(95, "a", 1.0, 0),
            row(96, "b", 5.0, 0),
            row(97, "", 50.0, 0),
            row(97, NULL_MODEL, 50.0, 0),
        ]);
        let split = json!({ "groupBy": "model" });

        assert_eq!(
            observed(&series, split.clone(), Some("b"), 100).value,
            Some(5.0)
        );
        let rule = rule(split);
        assert_eq!(
            series.top_models(&rule, window_of(&rule, 100)),
            vec!["b", "a"]
        );
    }

    #[test]
    fn the_top_contributor_is_the_model_with_the_largest_share() {
        let rule = rule(json!({ "metric": "total_cost" }));
        let mut series = Series::default();
        series.add_rows(&[
            row(10, "model-a", 1.0, 10),
            row(10, "model-b", 3.0, 10),
            row(11, "", 4.0, 10),
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
            .map(|i| row(95, &format!("model-{i:02}"), i as f64, 0))
            .collect();
        let mut series = Series::default();
        series.add_rows(&rows);
        let rule = rule(json!({ "groupBy": "model" }));

        let models = series.top_models(&rule, window_of(&rule, 100));
        assert_eq!(models.len(), MAX_GROUPS);
        assert_eq!(models.first().map(String::as_str), Some("model-29"));
        assert_eq!(models.last().map(String::as_str), Some("model-10"));
    }

    #[test]
    fn change_reads_the_same_window_shifted_back() {
        let week = 7 * 1440;
        let end = 100 + week;
        let mut series = Series::default();
        series.add_rows(&[row(96, "a", 4.0, 0), row(end - 2, "a", 6.0, 0)]);
        let change = json!({
            "condition": { "type": "change", "compareTo": "1w" }, "warning": 130, "resolve": 120
        });

        let now = observed(&series, change.clone(), None, end);
        assert_eq!(now.value, Some(6.0));
        assert_eq!(now.baseline, Some(4.0));
        assert_eq!(
            ranges_of(&rule(change.clone()), end),
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
        assert_eq!(observed(&series, change, None, end + 3).baseline, None);
    }

    #[test]
    fn llm_rates_divide_by_the_llm_calls_in_the_window() {
        let calls =
            |minute: i64, model: &str, calls: u64, errors: u64, no_cost: u64| SpanMetricsMinute {
                span_count: calls,
                llm_calls: calls,
                llm_errors: errors,
                llm_calls_no_cost: no_cost,
                llm_calls_no_tokens: errors,
                ..row(minute, model, 1.0, 10)
            };
        let mut series = Series::default();
        series.add_rows(&[
            calls(96, "a", 60, 6, 30),
            calls(98, "a", 20, 2, 10),
            calls(98, "b", 20, 2, 0),
            // Spans that are not LLM calls.
            calls(99, "", 0, 0, 0),
            calls(120, "a", 9, 9, 9),
        ]);
        let no_cost = json!({ "metric": "llm_no_cost_rate" });

        assert_eq!(
            observed(&series, no_cost.clone(), None, 100).value,
            Some(40.0)
        );
        // The minimum volume counts LLM calls.
        assert_eq!(observed(&series, no_cost.clone(), None, 100).volume, 100);
        let errors = json!({ "metric": "llm_error_rate" });
        assert_eq!(observed(&series, errors, None, 100).value, Some(10.0));
        let no_tokens = json!({ "metric": "llm_no_tokens_rate" });
        assert_eq!(observed(&series, no_tokens, None, 100).value, Some(10.0));
        let failed = json!({ "metric": "llm_errors" });
        assert_eq!(observed(&series, failed, None, 100).value, Some(10.0));

        let split = json!({ "metric": "llm_no_cost_rate", "groupBy": "model" });
        assert_eq!(
            observed(&series, split.clone(), Some("a"), 100).value,
            Some(50.0)
        );
        assert_eq!(observed(&series, split.clone(), Some("a"), 100).volume, 80);
        assert_eq!(
            observed(&series, split.clone(), Some("b"), 100).value,
            Some(0.0)
        );
        // No LLM calls, so no rate.
        assert_eq!(observed(&series, split.clone(), Some(""), 100).value, None);
        assert_eq!(observed(&series, no_cost, None, 110).value, None);

        let rule = rule(split);
        assert_eq!(
            series.top_models(&rule, window_of(&rule, 100)),
            vec!["a", "b"]
        );
    }

    #[test]
    fn llm_latency_quantiles_come_from_the_summed_histograms() {
        // 80 calls at about 1 s and 20 at about 10 s, over two minutes and models.
        let timed = |minute: i64, model: &str, millis: f64, calls: u64| SpanMetricsMinute {
            llm_calls: calls,
            llm_latency_buckets: vec![(bucket(millis), calls)],
            ..row(minute, model, 1.0, 10)
        };
        let mut series = Series::default();
        series.add_rows(&[
            timed(96, "a", 1000.0, 50),
            timed(97, "a", 1000.0, 30),
            timed(97, "b", 10000.0, 20),
        ]);
        let value = |metric: &str, group: Option<&str>| {
            let fields = json!({ "metric": metric, "groupBy": group.map(|_| "model") });
            observed(&series, fields, group, 100).value.unwrap()
        };

        let p50 = value("llm_latency_p50", None);
        let p95 = value("llm_latency_p95", None);
        assert!((p50 - 1.0).abs() < 0.05, "p50 {p50}");
        assert!((p95 - 10.0).abs() < 0.5, "p95 {p95}");
        let p95_a = value("llm_latency_p95", Some("a"));
        assert!((p95_a - 1.0).abs() < 0.05, "p95 of model a {p95_a}");

        let none = observed(&series, json!({ "metric": "llm_latency_p95" }), None, 200);
        assert_eq!(none.value, None);
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
