//! The metric rule stored in `alerts.metadata`. The frontend zod schema
//! mirrors this struct.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::filters;

pub const MAX_GROUPS: usize = 20;
const WINDOW_MINUTES: [u32; 4] = [5, 15, 60, 1440];
const MAX_CHECKS_IN_A_ROW: u32 = 10;
/// A budget without its own resolve threshold resolves below this share of it.
const BUDGET_RESOLVE_RATIO: f64 = 0.9;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Metric {
    TotalCost,
    CostPerTrace,
    /// Cost of the most expensive single trace in the window.
    TraceCost,
    InputTokens,
    OutputTokens,
    TotalTokens,
    TokensPerTrace,
    TraceCount,
    ErrorRate,
    LatencyP50,
    LatencyP95,
}

impl Metric {
    /// Sums that exist per span, so they can be read from the rollup and split
    /// by model.
    pub fn is_span_sum(self) -> bool {
        matches!(
            self,
            Metric::TotalCost | Metric::InputTokens | Metric::OutputTokens | Metric::TotalTokens
        )
    }

    pub fn is_per_trace(self) -> bool {
        matches!(self, Metric::CostPerTrace | Metric::TokensPerTrace)
    }

    /// Metrics that mean little on a handful of traces.
    pub fn needs_min_traces(self) -> bool {
        matches!(
            self,
            Metric::CostPerTrace
                | Metric::TokensPerTrace
                | Metric::ErrorRate
                | Metric::LatencyP50
                | Metric::LatencyP95
        )
    }

    pub fn is_latency(self) -> bool {
        matches!(self, Metric::LatencyP50 | Metric::LatencyP95)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GroupBy {
    Model,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Window {
    Minutes {
        minutes: u32,
    },
    /// From the start of the UTC month. Budgets only.
    MonthToDate {
        #[serde(rename = "monthToDate")]
        month_to_date: bool,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CompareTo {
    #[serde(rename = "5m")]
    FiveMinutes,
    #[serde(rename = "15m")]
    FifteenMinutes,
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
    /// Month-to-date spend against a budget in dollars.
    Budget { amount: f64 },
    /// Compare the most expensive trace to the project's p99 trace cost, as a
    /// percentage.
    TraceP99,
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

/// One trace filter, in the shape the traces table sends.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Filter {
    pub column: String,
    pub operator: String,
    pub value: Value,
}

fn default_checks_in_a_row() -> u32 {
    3
}

fn default_min_traces() -> u64 {
    50
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub metric: Metric,
    #[serde(default)]
    pub filters: Vec<Filter>,
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
    #[serde(default)]
    pub resolve: Option<f64>,
    /// Smallest absolute difference from the past value that counts as a change.
    #[serde(default)]
    pub min_change: Option<f64>,
    #[serde(default = "default_checks_in_a_row")]
    pub checks_in_a_row: u32,
    #[serde(default = "default_min_traces")]
    pub min_traces: u64,
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
struct EvaluatedFields<'a> {
    metric: Metric,
    filters: &'a [Filter],
    group_by: Option<GroupBy>,
    window: Window,
    condition: Condition,
    direction: Direction,
    warning: Option<f64>,
    critical: Option<f64>,
    resolve: Option<f64>,
    min_change: Option<f64>,
    checks_in_a_row: u32,
    min_traces: u64,
    on_no_data: OnNoData,
}

impl Rule {
    pub fn parse(metadata: &Value) -> Result<Rule, String> {
        let rule: Rule = serde_json::from_value(metadata.clone()).map_err(|e| e.to_string())?;
        rule.validate()?;
        Ok(rule)
    }

    /// What an empty window means. Unless the rule says otherwise, a sum or a
    /// count over nothing is zero, and a ratio over nothing is not checked.
    pub fn no_data_mode(&self) -> OnNoData {
        let default = if self.metric.needs_min_traces() {
            OnNoData::Skip
        } else {
            OnNoData::Zero
        };
        self.on_no_data.unwrap_or(default)
    }

    /// Whether the compared number is a percentage of a baseline.
    pub fn is_relative(&self) -> bool {
        matches!(
            self.condition,
            Condition::Change { .. } | Condition::TraceP99
        )
    }

    pub fn resolve_threshold(&self) -> f64 {
        match (self.resolve, self.condition) {
            (Some(resolve), _) => resolve,
            (None, Condition::Budget { amount }) => amount * BUDGET_RESOLVE_RATIO,
            // `validate` requires a resolve threshold for every other condition.
            (None, _) => self.warning.or(self.critical).unwrap_or(0.0),
        }
    }

    pub fn notifications_paused(&self, at: DateTime<Utc>) -> bool {
        self.disabled || self.snoozed_until.is_some_and(|until| at < until)
    }

    /// Changes whenever an edit should restart evaluation.
    pub fn fingerprint(&self) -> String {
        let fields = EvaluatedFields {
            metric: self.metric,
            filters: &self.filters,
            group_by: self.group_by,
            window: self.window,
            condition: self.condition,
            direction: self.direction,
            warning: self.warning,
            critical: self.critical,
            resolve: self.resolve,
            min_change: self.min_change,
            checks_in_a_row: self.checks_in_a_row,
            min_traces: self.min_traces,
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
        self.validate_window()?;
        self.validate_condition()?;
        self.validate_thresholds()?;
        if self.group_by.is_some() {
            if !(self.metric.is_span_sum() || self.metric.is_per_trace()) {
                return Err("This metric cannot be split by model".to_string());
            }
            if !self.filters.is_empty() {
                return Err("A rule with trace filters cannot be split by model".to_string());
            }
            if matches!(self.condition, Condition::Budget { .. }) {
                return Err("A budget cannot be split by model".to_string());
            }
        }
        filters::build_where(&self.filters).map(|_| ())
    }

    fn validate_window(&self) -> Result<(), String> {
        let is_budget = matches!(self.condition, Condition::Budget { .. });
        match self.window {
            Window::Minutes { minutes } if !WINDOW_MINUTES.contains(&minutes) => {
                Err("Window must be 5 minutes, 15 minutes, 1 hour or 1 day".to_string())
            }
            Window::Minutes { .. } if is_budget => {
                Err("A budget uses the month-to-date window".to_string())
            }
            Window::MonthToDate { .. } if !is_budget => {
                Err("Only budgets can use the month-to-date window".to_string())
            }
            Window::MonthToDate {
                month_to_date: false,
            } => Err("monthToDate must be true".to_string()),
            _ => Ok(()),
        }
    }

    fn validate_condition(&self) -> Result<(), String> {
        match self.condition {
            Condition::Budget { amount } => {
                if !(amount.is_finite() && amount > 0.0) {
                    return Err("Budget must be greater than zero".to_string());
                }
                if self.metric != Metric::TotalCost || self.direction != Direction::Above {
                    return Err("A budget watches total cost going above it".to_string());
                }
            }
            Condition::TraceP99 if self.metric != Metric::TraceCost => {
                return Err("This condition only applies to the cost of a single trace".to_string());
            }
            Condition::Change { .. } if self.metric == Metric::TraceCost => {
                return Err(
                    "The cost of a single trace cannot be compared to a past window".to_string(),
                );
            }
            _ => {}
        }
        if self.metric == Metric::TraceCost && self.direction != Direction::Above {
            return Err("The cost of a single trace can only alert above a threshold".to_string());
        }
        Ok(())
    }

    fn validate_thresholds(&self) -> Result<(), String> {
        if matches!(self.condition, Condition::Budget { .. }) {
            return Ok(());
        }
        let Some(resolve) = self.resolve else {
            return Err("A resolve threshold is required".to_string());
        };
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
        let first = self.warning.or(self.critical).unwrap_or(resolve);
        if resolve * sign > first * sign {
            return Err("Resolve cannot be past the first alerting threshold".to_string());
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
            "metric": "cost_per_trace",
            "filters": [],
            "groupBy": "model",
            "window": { "minutes": 60 },
            "condition": { "type": "change", "compareTo": "1w" },
            "direction": "above",
            "warning": 130,
            "critical": 150,
            "resolve": 120,
            "minChange": 0.10,
            "checksInARow": 3,
            "minTraces": 50,
            "onNoData": "skip",
            "snoozedUntil": null,
            "disabled": false
        })
    }

    #[test]
    fn parses_the_contract() {
        let rule = Rule::parse(&contract()).unwrap();
        assert_eq!(rule.metric, Metric::CostPerTrace);
        assert_eq!(rule.group_by, Some(GroupBy::Model));
        assert_eq!(rule.window, Window::Minutes { minutes: 60 });
        assert_eq!(
            rule.condition,
            Condition::Change {
                compare_to: CompareTo::Week
            }
        );
        assert_eq!(rule.min_change, Some(0.10));
    }

    #[test]
    fn parses_other_conditions() {
        let budget = json!({
            "metric": "total_cost",
            "window": { "monthToDate": true },
            "condition": { "type": "budget", "amount": 2000 },
            "warning": null,
            "critical": null
        });
        let rule = Rule::parse(&budget).unwrap();
        assert_eq!(rule.condition, Condition::Budget { amount: 2000.0 });
        assert_eq!(rule.resolve_threshold(), 1800.0);
        assert_eq!(rule.checks_in_a_row, 3);
        assert_eq!(rule.min_traces, 50);

        let p99 = json!({
            "metric": "trace_cost",
            "window": { "minutes": 15 },
            "condition": { "type": "trace_p99" },
            "warning": 300,
            "resolve": 200
        });
        assert_eq!(Rule::parse(&p99).unwrap().condition, Condition::TraceP99);
    }

    #[test]
    fn rejects_invalid_rules() {
        let cases = [
            ("resolve", json!(null), "resolve threshold is required"),
            ("resolve", json!(140), "Resolve cannot be past"),
            ("critical", json!(125), "Critical must be further out"),
            ("window", json!({ "minutes": 7 }), "Window must be"),
            ("window", json!({ "monthToDate": true }), "Only budgets"),
            ("checksInARow", json!(0), "Checks in a row"),
            ("metric", json!("error_rate"), "cannot be split by model"),
            (
                "filters",
                json!([{ "column": "user_id", "operator": "eq", "value": "x" }]),
                "cannot be split by model",
            ),
        ];
        for (field, value, expected) in cases {
            let mut rule = contract();
            rule[field] = value;
            let error = Rule::parse(&rule).unwrap_err();
            assert!(error.contains(expected), "{field}: {error}");
        }

        let mut rule = contract();
        rule["groupBy"] = json!(null);
        rule["filters"] = json!([{ "column": "nope", "operator": "eq", "value": "x" }]);
        let error = Rule::parse(&rule).unwrap_err();
        assert!(error.contains("Unknown filter column"), "{error}");
    }

    #[test]
    fn no_data_defaults_to_zero_for_sums_and_skip_for_ratios() {
        let mode = |metric: &str, on_no_data: Value| {
            let mut rule = contract();
            rule["metric"] = json!(metric);
            rule["groupBy"] = json!(null);
            rule["onNoData"] = on_no_data;
            Rule::parse(&rule).unwrap().no_data_mode()
        };
        for metric in ["total_cost", "total_tokens", "trace_count"] {
            assert_eq!(mode(metric, json!(null)), OnNoData::Zero, "{metric}");
        }
        for metric in ["cost_per_trace", "error_rate", "latency_p95"] {
            assert_eq!(mode(metric, json!(null)), OnNoData::Skip, "{metric}");
        }
        assert_eq!(mode("total_cost", json!("skip")), OnNoData::Skip);
        assert_eq!(mode("error_rate", json!("alert")), OnNoData::Alert);
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
