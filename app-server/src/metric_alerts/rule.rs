//! The metric rule stored in `alerts.metadata`. The frontend zod schema
//! mirrors this struct.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

pub const MAX_GROUPS: usize = 20;
const WINDOW_MINUTES: [u32; 5] = [5, 15, 30, 60, 1440];
const MAX_CHECKS_IN_A_ROW: u32 = 10;

/// Every metric is read from the `span_metrics_1m` rollup.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Metric {
    /// Spans of every type: the project's traffic.
    SpanCount,
    TotalCost,
    InputTokens,
    OutputTokens,
    TotalTokens,
    LlmCalls,
    /// LLM calls that failed.
    LlmErrors,
    /// Share of LLM calls that failed, in percent.
    LlmErrorRate,
    /// Share of LLM calls without a cost, in percent.
    LlmNoCostRate,
    /// Share of LLM calls without tokens, in percent.
    LlmNoTokensRate,
    /// LLM call duration, in seconds.
    LlmLatencyP50,
    LlmLatencyP95,
}

impl Metric {
    /// Counts and sums. The rest are rates and latencies of LLM calls.
    pub fn is_sum(self) -> bool {
        matches!(
            self,
            Metric::SpanCount
                | Metric::TotalCost
                | Metric::InputTokens
                | Metric::OutputTokens
                | Metric::TotalTokens
                | Metric::LlmCalls
                | Metric::LlmErrors
        )
    }

    /// Spans without a model share one rollup row, so the span count has no
    /// per-model split.
    pub fn can_split_by_model(self) -> bool {
        self != Metric::SpanCount
    }

    /// Rates and latencies mean little on a handful of LLM calls.
    pub fn needs_min_calls(self) -> bool {
        !self.is_sum()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GroupBy {
    Model,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Window {
    pub minutes: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CompareTo {
    #[serde(rename = "5m")]
    FiveMinutes,
    #[serde(rename = "15m")]
    FifteenMinutes,
    #[serde(rename = "30m")]
    ThirtyMinutes,
    #[serde(rename = "1h")]
    Hour,
    #[serde(rename = "1d")]
    Day,
    #[serde(rename = "1w")]
    Week,
    #[serde(rename = "30d")]
    ThirtyDays,
}

impl CompareTo {
    pub fn minutes(self) -> i64 {
        match self {
            CompareTo::FiveMinutes => 5,
            CompareTo::FifteenMinutes => 15,
            CompareTo::ThirtyMinutes => 30,
            CompareTo::Hour => 60,
            CompareTo::Day => 1440,
            CompareTo::Week => 7 * 1440,
            CompareTo::ThirtyDays => 30 * 1440,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Condition {
    /// Compare the value itself.
    Value,
    /// Compare this window to the same window shifted back, as a percentage.
    Change {
        #[serde(rename = "compareTo")]
        compare_to: CompareTo,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    #[default]
    Above,
    Below,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnNoData {
    Skip,
    Zero,
    Alert,
}

fn default_checks_in_a_row() -> u32 {
    3
}

fn default_min_calls() -> u64 {
    50
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub metric: Metric,
    #[serde(default)]
    pub group_by: Option<GroupBy>,
    pub window: Window,
    pub condition: Condition,
    #[serde(default)]
    pub direction: Direction,
    #[serde(default)]
    pub warning: Option<f64>,
    #[serde(default)]
    pub critical: Option<f64>,
    /// `None` resolves at the first alerting threshold.
    #[serde(default)]
    pub resolve: Option<f64>,
    /// Smallest absolute difference from the past value that counts as a change.
    #[serde(default)]
    pub min_change: Option<f64>,
    #[serde(default = "default_checks_in_a_row")]
    pub checks_in_a_row: u32,
    /// LLM calls a window needs before a rate or a latency is checked.
    #[serde(default = "default_min_calls")]
    pub min_calls: u64,
    /// `None` picks the metric's default, see `Rule::no_data_mode`.
    #[serde(default)]
    pub on_no_data: Option<OnNoData>,
    #[serde(default)]
    pub snoozed_until: Option<DateTime<Utc>>,
    /// Muted. The rule is still checked, but sends nothing.
    #[serde(default)]
    pub disabled: bool,
}

/// The fields that decide what a check concludes. Name, targets, snooze and
/// mute are left out, so changing them keeps the state.
#[derive(Serialize)]
struct EvaluatedFields {
    metric: Metric,
    group_by: Option<GroupBy>,
    window: Window,
    condition: Condition,
    direction: Direction,
    warning: Option<f64>,
    critical: Option<f64>,
    resolve: Option<f64>,
    min_change: Option<f64>,
    checks_in_a_row: u32,
    min_calls: u64,
    on_no_data: OnNoData,
}

impl Rule {
    pub fn parse(metadata: &Value) -> Result<Rule, String> {
        let rule: Rule = serde_json::from_value(metadata.clone()).map_err(|e| e.to_string())?;
        rule.validate()?;
        Ok(rule)
    }

    /// What an empty window means. Unless the rule says otherwise, a sum or a
    /// count over nothing is zero, and a rate or a latency is not checked.
    pub fn no_data_mode(&self) -> OnNoData {
        let default = if self.metric.is_sum() {
            OnNoData::Zero
        } else {
            OnNoData::Skip
        };
        self.on_no_data.unwrap_or(default)
    }

    /// Whether the compared number is a percentage of a baseline.
    pub fn is_relative(&self) -> bool {
        matches!(self.condition, Condition::Change { .. })
    }

    pub fn resolve_threshold(&self) -> f64 {
        self.resolve
            .or(self.warning)
            .or(self.critical)
            .unwrap_or(0.0)
    }

    pub fn notifications_paused(&self, at: DateTime<Utc>) -> bool {
        self.disabled || self.snoozed_until.is_some_and(|until| at < until)
    }

    /// Changes whenever an edit should restart evaluation.
    pub fn fingerprint(&self) -> String {
        let fields = EvaluatedFields {
            metric: self.metric,
            group_by: self.group_by,
            window: self.window,
            condition: self.condition,
            direction: self.direction,
            warning: self.warning,
            critical: self.critical,
            resolve: self.resolve,
            min_change: self.min_change,
            checks_in_a_row: self.checks_in_a_row,
            min_calls: self.min_calls,
            on_no_data: self.no_data_mode(),
        };
        let bytes = serde_json::to_vec(&fields).unwrap_or_default();
        hex::encode(Sha256::digest(bytes))
    }

    pub fn validate(&self) -> Result<(), String> {
        let numbers = [self.warning, self.critical, self.resolve, self.min_change];
        if numbers.iter().flatten().any(|n| !n.is_finite()) {
            return Err("Thresholds must be finite numbers".to_string());
        }
        if self.min_change.is_some_and(|m| m < 0.0) {
            return Err("Minimum change cannot be negative".to_string());
        }
        if !(1..=MAX_CHECKS_IN_A_ROW).contains(&self.checks_in_a_row) {
            return Err(format!(
                "Checks in a row must be between 1 and {MAX_CHECKS_IN_A_ROW}"
            ));
        }
        if !WINDOW_MINUTES.contains(&self.window.minutes) {
            return Err("Window must be 5, 15 or 30 minutes, 1 hour or 1 day".to_string());
        }
        if self.group_by.is_some() && !self.metric.can_split_by_model() {
            return Err("This metric cannot be split by model".to_string());
        }
        self.validate_thresholds()
    }

    fn validate_thresholds(&self) -> Result<(), String> {
        if self.warning.is_none() && self.critical.is_none() {
            return Err("Set a warning or a critical threshold".to_string());
        }
        // Compare as if the rule alerted above, so one set of checks serves both.
        let sign = match self.direction {
            Direction::Above => 1.0,
            Direction::Below => -1.0,
        };
        if let (Some(warning), Some(critical)) = (self.warning, self.critical) {
            if critical * sign <= warning * sign {
                return Err("Critical must be further out than warning".to_string());
            }
        }
        let first = self.warning.or(self.critical);
        if let (Some(resolve), Some(first)) = (self.resolve, first) {
            if resolve * sign > first * sign {
                return Err("Resolve cannot be past the first alerting threshold".to_string());
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn contract() -> Value {
        json!({
            "metric": "total_cost",
            "groupBy": "model",
            "window": { "minutes": 60 },
            "condition": { "type": "change", "compareTo": "1w" },
            "direction": "above",
            "warning": 130,
            "critical": 150,
            "resolve": 120,
            "minChange": 0.10,
            "checksInARow": 3,
            "minCalls": 50,
            "onNoData": "skip",
            "snoozedUntil": null,
            "disabled": false
        })
    }

    #[test]
    fn parses_the_contract() {
        let rule = Rule::parse(&contract()).unwrap();
        assert_eq!(rule.metric, Metric::TotalCost);
        assert_eq!(rule.group_by, Some(GroupBy::Model));
        assert_eq!(rule.window, Window { minutes: 60 });
        assert_eq!(
            rule.condition,
            Condition::Change {
                compare_to: CompareTo::Week
            }
        );
        assert_eq!(rule.min_change, Some(0.10));

        let minimal = json!({
            "metric": "llm_error_rate",
            "window": { "minutes": 15 },
            "condition": { "type": "value" },
            "critical": 20
        });
        let rule = Rule::parse(&minimal).unwrap();
        assert_eq!(rule.condition, Condition::Value);
        assert_eq!(rule.checks_in_a_row, 3);
        assert_eq!(rule.min_calls, 50);
    }

    #[test]
    fn rejects_invalid_rules() {
        let cases = [
            ("resolve", json!(140), "Resolve cannot be past"),
            ("critical", json!(125), "Critical must be further out"),
            ("window", json!({ "minutes": 7 }), "Window must be"),
            ("window", json!({ "monthToDate": true }), "missing field"),
            (
                "condition",
                json!({ "type": "change", "compareTo": "2h" }),
                "unknown variant",
            ),
            (
                "condition",
                json!({ "type": "spending_limit", "limit": 10 }),
                "unknown variant",
            ),
            ("checksInARow", json!(0), "Checks in a row"),
            ("metric", json!("span_count"), "cannot be split by model"),
            ("metric", json!("trace_count"), "unknown variant"),
        ];
        for (field, value, expected) in cases {
            let mut rule = contract();
            rule[field] = value;
            let error = Rule::parse(&rule).unwrap_err();
            assert!(error.contains(expected), "{field}: {error}");
        }
    }

    #[test]
    fn resolve_follows_the_first_threshold_when_unset() {
        let mut rule = contract();
        rule["resolve"] = json!(null);
        assert_eq!(Rule::parse(&rule).unwrap().resolve_threshold(), 130.0);
        rule["warning"] = json!(null);
        assert_eq!(Rule::parse(&rule).unwrap().resolve_threshold(), 150.0);
    }

    #[test]
    fn accepts_30_minutes_as_a_window_and_as_a_comparison() {
        let mut rule = contract();
        rule["window"] = json!({ "minutes": 30 });
        rule["condition"] = json!({ "type": "change", "compareTo": "30m" });
        let rule = Rule::parse(&rule).unwrap();
        assert_eq!(rule.window, Window { minutes: 30 });
        let Condition::Change { compare_to } = rule.condition else {
            panic!("expected a change condition");
        };
        assert_eq!(compare_to.minutes(), 30);
    }

    #[test]
    fn no_data_defaults_to_zero_for_sums_and_skip_for_rates() {
        let mode = |metric: &str, on_no_data: Value| {
            let mut rule = contract();
            rule["metric"] = json!(metric);
            rule["groupBy"] = json!(null);
            rule["onNoData"] = on_no_data;
            Rule::parse(&rule).unwrap().no_data_mode()
        };
        let sums = [
            "span_count",
            "total_cost",
            "total_tokens",
            "llm_calls",
            "llm_errors",
        ];
        for metric in sums {
            assert_eq!(mode(metric, json!(null)), OnNoData::Zero, "{metric}");
        }
        let rates = [
            "llm_error_rate",
            "llm_no_cost_rate",
            "llm_no_tokens_rate",
            "llm_latency_p50",
            "llm_latency_p95",
        ];
        for metric in rates {
            assert_eq!(mode(metric, json!(null)), OnNoData::Skip, "{metric}");
        }
        assert_eq!(mode("total_cost", json!("skip")), OnNoData::Skip);
        assert_eq!(mode("llm_error_rate", json!("alert")), OnNoData::Alert);
    }

    #[test]
    fn every_metric_but_the_span_count_splits_by_model() {
        let metrics = [
            "total_cost",
            "input_tokens",
            "llm_calls",
            "llm_errors",
            "llm_error_rate",
            "llm_no_cost_rate",
            "llm_no_tokens_rate",
            "llm_latency_p95",
        ];
        for metric in metrics {
            let mut rule = contract();
            rule["metric"] = json!(metric);
            assert!(Rule::parse(&rule).is_ok(), "{metric}");
        }
    }

    #[test]
    fn fingerprint_ignores_snooze_and_mute() {
        let rule = Rule::parse(&contract()).unwrap();
        let mut muted = rule.clone();
        muted.disabled = true;
        muted.snoozed_until = Some(Utc::now());
        assert_eq!(rule.fingerprint(), muted.fingerprint());

        let mut edited = rule.clone();
        edited.warning = Some(135.0);
        assert_ne!(rule.fingerprint(), edited.fingerprint());
    }
}
