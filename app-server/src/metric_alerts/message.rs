//! The words of a metric alert message. No IO, so the text can be tested and
//! every channel shows the same numbers.

use chrono::{DateTime, Duration, SecondsFormat, Utc};
use url::form_urlencoded;
use uuid::Uuid;

use crate::notifications::{MetricAlertDetail, MetricAlertNotification};

use super::{
    engine::{Incident, Level, Transition, TransitionKind},
    rule::{CompareTo, Condition, Direction, Metric, Rule, Window},
    series::{Contributor, reads_spans, time_of, window_of},
};

/// The rule a message is about.
pub struct Subject<'a> {
    pub project_id: Uuid,
    pub project_name: &'a str,
    pub alert_id: Uuid,
    pub alert_name: &'a str,
    pub rule: &'a Rule,
    pub interval_minutes: i64,
    /// Empty for rules that are not split.
    pub group: &'a str,
}

/// What a check found, with the incident as it is after the transition.
pub struct Event<'a> {
    pub transition: &'a Transition,
    pub incident: &'a Incident,
    pub top_model: Option<Contributor>,
}

fn separated(digits: &str) -> String {
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index) % 3 == 0 {
            out.push(',');
        }
        out.push(digit);
    }
    out
}

/// `1234567.891` with two decimals becomes `1,234,567.89`.
fn number(value: f64, decimals: usize) -> String {
    let formatted = format!("{:.*}", decimals, value.abs());
    let (whole, fraction) = formatted.split_once('.').unwrap_or((&formatted, ""));
    let sign = if value < 0.0 { "-" } else { "" };
    if fraction.is_empty() {
        format!("{sign}{}", separated(whole))
    } else {
        format!("{sign}{}.{fraction}", separated(whole))
    }
}

/// Dollars with cents, or two significant digits for amounts under ten cents.
fn money(value: f64) -> String {
    let abs = value.abs();
    let decimals = if abs >= 0.1 || abs == 0.0 {
        2
    } else {
        (1.0 - abs.log10().floor()).clamp(2.0, 8.0) as usize
    };
    format!("${}", number(value, decimals))
}

fn percent(value: f64) -> String {
    let decimals = if value.abs() >= 100.0 || value.fract() == 0.0 {
        0
    } else {
        1
    };
    format!("{}%", number(value, decimals))
}

fn plural(count: f64, noun: &str) -> String {
    let suffix = if count == 1.0 { "" } else { "s" };
    format!("{} {noun}{suffix}", number(count, 0))
}

fn metric_value(metric: Metric, value: f64) -> String {
    match metric {
        Metric::TotalCost | Metric::CostPerTrace | Metric::TraceCost => money(value),
        Metric::InputTokens | Metric::OutputTokens | Metric::TotalTokens => {
            plural(value.round(), "token")
        }
        Metric::TokensPerTrace if value < 100.0 => format!("{} tokens", number(value, 1)),
        Metric::TokensPerTrace => plural(value.round(), "token"),
        Metric::TraceCount => plural(value.round(), "trace"),
        Metric::ErrorTraces => number(value.round(), 0),
        Metric::ErrorRate
        | Metric::NoCostRate
        | Metric::NoTokensRate
        | Metric::LlmNoCostRate
        | Metric::LlmNoTokensRate => percent(value),
        Metric::LatencyP50 | Metric::LatencyP95 if value < 1.0 => {
            format!("{} ms", number(value * 1000.0, 0))
        }
        Metric::LatencyP50 | Metric::LatencyP95 => format!("{} s", number(value, 2)),
    }
}

/// A threshold or compared number: a percentage for relative conditions,
/// otherwise the metric's own unit.
fn compared_value(rule: &Rule, value: f64) -> String {
    if rule.is_relative() {
        percent(value)
    } else {
        metric_value(rule.metric, value)
    }
}

fn metric_label(metric: Metric) -> &'static str {
    match metric {
        Metric::TotalCost => "Total cost",
        Metric::CostPerTrace => "Cost per trace",
        Metric::TraceCost => "Highest trace cost",
        Metric::InputTokens => "Input tokens",
        Metric::OutputTokens => "Output tokens",
        Metric::TotalTokens => "Total tokens",
        Metric::TokensPerTrace => "Tokens per trace",
        Metric::TraceCount => "Trace count",
        Metric::ErrorTraces => "Errored traces",
        Metric::ErrorRate => "Error rate",
        Metric::NoCostRate => "Traces with no cost",
        Metric::NoTokensRate => "Traces with no tokens",
        Metric::LlmNoCostRate => "LLM calls with no cost",
        Metric::LlmNoTokensRate => "LLM calls with no tokens",
        Metric::LatencyP50 => "Latency p50",
        Metric::LatencyP95 => "Latency p95",
    }
}

fn span_of_minutes(minutes: i64) -> String {
    match minutes {
        m if m % 1440 == 0 => plural((m / 1440) as f64, "day"),
        m if m % 60 == 0 => plural((m / 60) as f64, "hour"),
        m => plural(m as f64, "minute"),
    }
}

fn window_label(window: Window) -> String {
    match window {
        Window::Minutes { minutes: 60 } => "the last hour".to_string(),
        Window::Minutes { minutes: 1440 } => "the last day".to_string(),
        Window::Minutes { minutes } => format!("the last {}", span_of_minutes(minutes as i64)),
        Window::MonthToDate { .. } => "this month".to_string(),
    }
}

fn shift_label(compare_to: CompareTo) -> String {
    match compare_to {
        CompareTo::Week => "1 week".to_string(),
        other => span_of_minutes(other.minutes()),
    }
}

fn duration_label(duration: Duration) -> String {
    let minutes = duration.num_minutes().max(0);
    let (days, hours, mins) = (minutes / 1440, minutes % 1440 / 60, minutes % 60);
    match (days, hours, mins) {
        (0, 0, m) => format!("{m} min"),
        (0, h, 0) => format!("{h} h"),
        (0, h, m) => format!("{h} h {m} min"),
        (d, 0, _) => format!("{d} d"),
        (d, h, _) => format!("{d} d {h} h"),
    }
}

fn level_label(level: Level) -> &'static str {
    match level {
        Level::Ok => "OK",
        Level::Warning => "Warning",
        Level::Critical => "Critical",
    }
}

fn headline(rule: &Rule, transition: &Transition) -> String {
    let level = level_label(transition.to);
    let at_limit = transition.to == Level::Critical;
    match (transition.kind, rule.is_spending_limit()) {
        (TransitionKind::Resolved, _) => "Resolved".to_string(),
        (TransitionKind::Opened | TransitionKind::Escalated, true) if at_limit => {
            "Spending limit reached".to_string()
        }
        (TransitionKind::Opened, true) => "Approaching spending limit".to_string(),
        (TransitionKind::Reminder, true) if at_limit => "Still at spending limit".to_string(),
        (TransitionKind::Reminder, true) => "Still approaching spending limit".to_string(),
        (TransitionKind::Opened, _) => level.to_string(),
        (TransitionKind::Escalated, _) => format!("Escalated to {level}"),
        (TransitionKind::Deescalated, _) => format!("Down to {level}"),
        (TransitionKind::Reopened, _) => format!("Reopened at {level}"),
        (TransitionKind::Reminder, _) => format!("Still {level}"),
    }
}

/// The threshold a level was reached at. A rule may define only one of them.
fn level_threshold(rule: &Rule, level: Level) -> Option<f64> {
    match level {
        Level::Critical => rule.critical.or(rule.warning),
        _ => rule.warning.or(rule.critical),
    }
}

struct Sides {
    /// The side of a threshold that alerts, and the side that does not.
    past: &'static str,
    back: &'static str,
}

fn sides(direction: Direction) -> Sides {
    match direction {
        Direction::Above => Sides {
            past: "above",
            back: "below",
        },
        Direction::Below => Sides {
            past: "below",
            back: "above",
        },
    }
}

/// "Total cost for gpt-4o over the last hour"
fn measured_what(subject: &Subject) -> String {
    let metric = metric_label(subject.rule.metric);
    let window = window_label(subject.rule.window);
    if subject.group.is_empty() {
        format!("{metric} over {window}")
    } else {
        format!("{metric} for {} over {window}", subject.group)
    }
}

/// "Spend this month" or "Spend over the last day"
fn spend_label(window: Window) -> String {
    match window {
        Window::MonthToDate { .. } => "Spend this month".to_string(),
        window => format!("Spend over {}", window_label(window)),
    }
}

/// The sentence that holds the value against the baseline or the limit.
fn measurement(subject: &Subject, transition: &Transition) -> String {
    let rule = subject.rule;
    let Some(value) = transition.value else {
        return format!("No data in {}.", window_label(rule.window));
    };
    let what = measured_what(subject);
    let measured = value;
    let value = metric_value(rule.metric, value);
    let relative = transition.compared.zip(transition.baseline);

    match (rule.condition, relative) {
        (Condition::Change { compare_to }, Some((compared, baseline))) => format!(
            "{what} is {value}, {} of the same window {} earlier ({}).",
            percent(compared),
            shift_label(compare_to),
            metric_value(rule.metric, baseline),
        ),
        (Condition::TraceP99, Some((compared, baseline))) => format!(
            "{what} is {value}, {} of the p99 trace cost of the last 7 days ({}).",
            percent(compared),
            money(baseline),
        ),
        (Condition::SpendingLimit { limit, .. }, _) if transition.to == Level::Critical => {
            format!(
                "{} is {value} and has reached the spending limit of {}.",
                spend_label(rule.window),
                money(limit)
            )
        }
        (Condition::SpendingLimit { limit, .. }, _) => format!(
            "{} is {value}, {} of the spending limit of {}.",
            spend_label(rule.window),
            percent((measured / limit * 100.0).floor()),
            money(limit)
        ),
        _ => format!("{what} is {value}."),
    }
}

/// How the compared number stands against the threshold that matters now.
fn standing(rule: &Rule, transition: &Transition) -> Option<String> {
    if rule.is_spending_limit() || transition.value.is_none() {
        return None;
    }
    let sides = sides(rule.direction);
    let level = level_label(transition.to).to_lowercase();
    let resolve = compared_value(rule, rule.resolve_threshold());
    let sentence = match transition.kind {
        TransitionKind::Resolved if rule.is_relative() => {
            format!("The resolve threshold is {resolve}.")
        }
        TransitionKind::Resolved => {
            format!(
                "That is back {} the resolve threshold of {resolve}.",
                sides.back
            )
        }
        TransitionKind::Deescalated => {
            let critical = compared_value(rule, level_threshold(rule, Level::Critical)?);
            format!(
                "That is back {} the critical threshold of {critical}. The incident resolves at {resolve}.",
                sides.back
            )
        }
        _ => {
            let threshold = compared_value(rule, level_threshold(rule, transition.to)?);
            if rule.is_relative() {
                format!("The {level} threshold is {threshold}.")
            } else {
                format!(
                    "That is {} the {level} threshold of {threshold}.",
                    sides.past
                )
            }
        }
    };
    Some(sentence)
}

/// When the incident last started firing.
fn firing_since(incident: &Incident) -> DateTime<Utc> {
    incident.reopened_at.unwrap_or(incident.opened_at)
}

fn timestamp(at: DateTime<Utc>) -> String {
    at.format("%b %-d, %Y at %-I:%M %p UTC").to_string()
}

fn closing(subject: &Subject, event: &Event) -> Option<String> {
    let transition = event.transition;
    let incident = event.incident;
    let lasted = duration_label(transition.at - firing_since(incident));
    match transition.kind {
        TransitionKind::Resolved => Some(format!(
            "The incident lasted {lasted} and peaked at {}.",
            compared_value(subject.rule, incident.peak_value)
        )),
        TransitionKind::Reminder => Some(format!("Open for {lasted}.")),
        TransitionKind::Reopened => Some(format!(
            "This continues the incident opened on {}.",
            timestamp(incident.opened_at)
        )),
        _ => None,
    }
}

fn summary(subject: &Subject, event: &Event) -> String {
    [
        Some(measurement(subject, event.transition)),
        standing(subject.rule, event.transition),
        closing(subject, event),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ")
}

fn detail(label: &str, value: String) -> MetricAlertDetail {
    MetricAlertDetail {
        label: label.to_string(),
        value,
    }
}

fn details(subject: &Subject, event: &Event) -> Vec<MetricAlertDetail> {
    let rule = subject.rule;
    let transition = event.transition;
    let resolved = transition.kind == TransitionKind::Resolved;
    let mut rows = Vec::new();

    let value = transition.value.map(|v| metric_value(rule.metric, v));
    rows.push(detail("Value", value.unwrap_or("No data".to_string())));

    match (rule.condition, transition.baseline) {
        (Condition::Change { compare_to }, Some(baseline)) => rows.push(detail(
            &format!("{} earlier", shift_label(compare_to)),
            metric_value(rule.metric, baseline),
        )),
        (Condition::TraceP99, Some(baseline)) => {
            rows.push(detail("p99 trace cost", money(baseline)))
        }
        _ => {}
    }
    if let (true, Some(compared)) = (rule.is_relative(), transition.compared) {
        rows.push(detail("Compared", percent(compared)));
    }

    if let Condition::SpendingLimit {
        limit,
        warn_at_percent,
    } = rule.condition
    {
        rows.push(detail("Spending limit", money(limit)));
        rows.push(detail("Warn at", percent(warn_at_percent)));
    } else if resolved {
        rows.push(detail(
            "Resolve threshold",
            compared_value(rule, rule.resolve_threshold()),
        ));
    } else if let Some(threshold) = level_threshold(rule, transition.to) {
        rows.push(detail(
            &format!("{} threshold", level_label(transition.to)),
            compared_value(rule, threshold),
        ));
    }

    if !subject.group.is_empty() {
        rows.push(detail("Model", subject.group.to_string()));
    }
    if let Some(top) = &event.top_model {
        rows.push(detail(
            "Top model",
            format!("{} ({})", top.model, percent((top.share * 100.0).round())),
        ));
    }

    let lasted = duration_label(transition.at - firing_since(event.incident));
    match transition.kind {
        TransitionKind::Resolved => {
            rows.push(detail("Duration", lasted));
            rows.push(detail(
                "Peak",
                compared_value(rule, event.incident.peak_value),
            ));
        }
        TransitionKind::Reminder => rows.push(detail("Open for", lasted)),
        _ => {}
    }

    rows
}

/// Whether a message names the model behind most of the number: only where
/// the per-model sums are already loaded and "most" explains the alert.
pub fn names_top_model(rule: &Rule, transition: &Transition) -> bool {
    let firing = !matches!(
        transition.kind,
        TransitionKind::Resolved | TransitionKind::Deescalated
    );
    firing
        && transition.value.is_some()
        && rule.group_by.is_none()
        && rule.direction == Direction::Above
        && reads_spans(rule)
}

/// The traces behind the incident: the rule's filters over the time from the
/// first breaching window to this check, most expensive first.
fn traces_path(subject: &Subject, event: &Event) -> String {
    let rule = subject.rule;
    let lead = (rule.checks_in_a_row as i64 - 1) * subject.interval_minutes;
    let first_check = event.incident.opened_at.timestamp().div_euclid(60) - lead;
    let start = time_of(window_of(rule, first_check).start);

    let mut query = form_urlencoded::Serializer::new(String::new());
    query.append_pair(
        "startDate",
        &start.to_rfc3339_opts(SecondsFormat::Secs, true),
    );
    query.append_pair(
        "endDate",
        &event
            .transition
            .at
            .to_rfc3339_opts(SecondsFormat::Secs, true),
    );
    // The traces table reads `filter` as one comma-separated list, with the
    // commas inside each filter escaped.
    let filters: Vec<String> = rule
        .filters
        .iter()
        .filter_map(|filter| serde_json::to_string(filter).ok())
        .map(|filter| filter.replace(',', "%2C"))
        .collect();
    if !filters.is_empty() {
        query.append_pair("filter", &filters.join(","));
    }
    query.append_pair("sortBy", "cost");
    query.append_pair("sortDirection", "desc");

    format!("/project/{}/traces?{}", subject.project_id, query.finish())
}

/// The alert page of a rule.
pub fn alert_path(project_id: &Uuid, alert_id: &Uuid) -> String {
    format!("/project/{project_id}/settings/alerts/{alert_id}")
}

/// Builds the message for a transition. `None` while the incident is not
/// stored, since replies are threaded by its id.
pub fn build(subject: &Subject, event: &Event) -> Option<MetricAlertNotification> {
    let transition = event.transition;
    Some(MetricAlertNotification {
        project_id: subject.project_id,
        project_name: subject.project_name.to_string(),
        alert_id: subject.alert_id,
        alert_name: subject.alert_name.to_string(),
        incident_id: event.incident.id?,
        transition: transition.kind,
        level: transition.to,
        group: (!subject.group.is_empty()).then(|| subject.group.to_string()),
        headline: headline(subject.rule, transition),
        summary: summary(subject, event),
        details: details(subject, event),
        traces_path: traces_path(subject, event),
        alert_path: alert_path(&subject.project_id, &subject.alert_id),
        checked_at: timestamp(transition.at),
    })
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;
    use serde_json::json;

    use super::{super::rule::Filter, *};

    fn at(hour: u32, minute: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 11, 25, hour, minute, 0).unwrap()
    }

    fn rule(value: serde_json::Value) -> Rule {
        Rule::parse(&value).unwrap()
    }

    fn cost_rule() -> Rule {
        rule(json!({
            "metric": "total_cost",
            "window": { "minutes": 5 },
            "condition": { "type": "value" },
            "warning": 2.0,
            "critical": 2.8,
            "resolve": 1.5,
        }))
    }

    fn incident() -> Incident {
        Incident {
            id: Some(Uuid::from_u128(9)),
            level: Level::Warning,
            peak_level: Level::Warning,
            peak_value: 3.1,
            opened_at: at(19, 12),
            escalated_at: None,
            reopened_at: None,
            resolved_at: None,
            last_notified_at: None,
        }
    }

    fn transition(kind: TransitionKind, to: Level, value: f64) -> Transition {
        Transition {
            kind,
            from: Level::Ok,
            to,
            at: at(19, 35),
            value: Some(value),
            compared: Some(value),
            baseline: None,
            notify: true,
        }
    }

    fn message(
        rule: &Rule,
        group: &str,
        transition: &Transition,
        incident: &Incident,
    ) -> MetricAlertNotification {
        let subject = Subject {
            project_id: Uuid::from_u128(1),
            project_name: "prod",
            alert_id: Uuid::from_u128(2),
            alert_name: "Cost spike",
            rule,
            interval_minutes: 1,
            group,
        };
        let event = Event {
            transition,
            incident,
            top_model: None,
        };
        build(&subject, &event).unwrap()
    }

    #[test]
    fn numbers_read_like_their_unit() {
        assert_eq!(money(1234.5), "$1,234.50");
        assert_eq!(money(0.4), "$0.40");
        assert_eq!(money(0.0123), "$0.012");
        assert_eq!(money(0.00045), "$0.00045");
        assert_eq!(money(0.0), "$0.00");
        assert_eq!(percent(165.4), "165%");
        assert_eq!(percent(12.5), "12.5%");
        assert_eq!(percent(10.0), "10%");
        assert_eq!(
            metric_value(Metric::TotalTokens, 1_250_000.0),
            "1,250,000 tokens"
        );
        assert_eq!(metric_value(Metric::TraceCount, 1.0), "1 trace");
        assert_eq!(metric_value(Metric::ErrorTraces, 12.0), "12");
        assert_eq!(metric_value(Metric::NoCostRate, 62.5), "62.5%");
        assert_eq!(metric_value(Metric::LatencyP95, 0.34), "340 ms");
        assert_eq!(metric_value(Metric::LatencyP95, 2.314), "2.31 s");
        assert_eq!(duration_label(Duration::minutes(23)), "23 min");
        assert_eq!(duration_label(Duration::minutes(125)), "2 h 5 min");
        assert_eq!(duration_label(Duration::minutes(1500)), "1 d 1 h");
    }

    #[test]
    fn opened_states_value_and_threshold() {
        let rule = cost_rule();
        let opened = transition(TransitionKind::Opened, Level::Warning, 2.41);
        let message = message(&rule, "", &opened, &incident());

        assert_eq!(message.headline, "Warning");
        assert_eq!(
            message.summary,
            "Total cost over the last 5 minutes is $2.41. That is above the warning threshold of $2.00."
        );
        assert_eq!(message.details[0], detail("Value", "$2.41".to_string()));
        assert_eq!(
            message.details[1],
            detail("Warning threshold", "$2.00".to_string())
        );
        assert_eq!(message.severity(), 1);
        assert!(message.is_major());
    }

    #[test]
    fn each_transition_has_its_own_headline() {
        let rule = cost_rule();
        let headline_of = |kind, to| headline(&rule, &transition(kind, to, 3.0));

        assert_eq!(
            headline_of(TransitionKind::Escalated, Level::Critical),
            "Escalated to Critical"
        );
        assert_eq!(
            headline_of(TransitionKind::Deescalated, Level::Warning),
            "Down to Warning"
        );
        assert_eq!(headline_of(TransitionKind::Resolved, Level::Ok), "Resolved");
        assert_eq!(
            headline_of(TransitionKind::Reopened, Level::Critical),
            "Reopened at Critical"
        );
        assert_eq!(
            headline_of(TransitionKind::Reminder, Level::Warning),
            "Still Warning"
        );
    }

    #[test]
    fn resolved_reports_duration_and_peak() {
        let rule = cost_rule();
        let resolved = transition(TransitionKind::Resolved, Level::Ok, 1.2);
        let message = message(&rule, "", &resolved, &incident());

        assert_eq!(
            message.summary,
            "Total cost over the last 5 minutes is $1.20. That is back below the resolve threshold of $1.50. The incident lasted 23 min and peaked at $3.10."
        );
        assert_eq!(message.severity(), 0);
        assert!(
            message
                .details
                .contains(&detail("Duration", "23 min".to_string()))
        );
    }

    #[test]
    fn reminders_and_steps_down_are_not_major() {
        let rule = cost_rule();
        let reminder = transition(TransitionKind::Reminder, Level::Warning, 2.4);
        let message_of = |t: &Transition| message(&rule, "", t, &incident());

        let reminded = message_of(&reminder);
        assert!(!reminded.is_major());
        assert!(reminded.summary.ends_with("Open for 23 min."));

        let down = transition(TransitionKind::Deescalated, Level::Warning, 2.4);
        let stepped_down = message_of(&down);
        assert!(!stepped_down.is_major());
        assert!(stepped_down.summary.contains(
            "back below the critical threshold of $2.80. The incident resolves at $1.50."
        ));
    }

    #[test]
    fn change_shows_the_past_value() {
        let rule = rule(json!({
            "metric": "cost_per_trace",
            "groupBy": "model",
            "window": { "minutes": 60 },
            "condition": { "type": "change", "compareTo": "1w" },
            "warning": 130,
            "resolve": 120,
        }));
        let mut opened = transition(TransitionKind::Opened, Level::Warning, 0.4);
        opened.compared = Some(160.0);
        opened.baseline = Some(0.25);
        let message = message(&rule, "gpt-4o", &opened, &incident());

        assert_eq!(
            message.summary,
            "Cost per trace for gpt-4o over the last hour is $0.40, 160% of the same window 1 week earlier ($0.25). The warning threshold is 130%."
        );
        assert_eq!(message.subject(), "Cost spike (gpt-4o)");
        assert!(
            message
                .details
                .contains(&detail("1 week earlier", "$0.25".to_string()))
        );
        assert!(
            message
                .details
                .contains(&detail("Model", "gpt-4o".to_string()))
        );
    }

    #[test]
    fn a_spending_limit_speaks_of_spend_and_the_limit() {
        let monthly = rule(json!({
            "metric": "total_cost",
            "window": { "monthToDate": true },
            "condition": { "type": "spending_limit", "limit": 2000 },
        }));
        let near = transition(TransitionKind::Opened, Level::Warning, 1650.0);
        let approaching = message(&monthly, "", &near, &incident());
        assert_eq!(approaching.headline, "Approaching spending limit");
        assert_eq!(
            approaching.summary,
            "Spend this month is $1,650.00, 82% of the spending limit of $2,000.00."
        );
        assert!(
            approaching
                .details
                .contains(&detail("Spending limit", "$2,000.00".to_string()))
        );
        assert!(
            approaching
                .details
                .contains(&detail("Warn at", "80%".to_string()))
        );

        let daily = rule(json!({
            "metric": "total_cost",
            "window": { "minutes": 1440 },
            "condition": { "type": "spending_limit", "limit": 50, "warnAtPercent": 90 },
        }));
        let over = transition(TransitionKind::Escalated, Level::Critical, 50.0);
        let reached = message(&daily, "", &over, &incident());
        assert_eq!(reached.headline, "Spending limit reached");
        assert_eq!(
            reached.summary,
            "Spend over the last day is $50.00 and has reached the spending limit of $50.00."
        );
    }

    #[test]
    fn errored_traces_are_a_plain_count() {
        let rule = rule(json!({
            "metric": "error_traces",
            "window": { "minutes": 30 },
            "condition": { "type": "value" },
            "warning": 5,
        }));
        let opened = transition(TransitionKind::Opened, Level::Warning, 12.0);
        assert_eq!(
            message(&rule, "", &opened, &incident()).summary,
            "Errored traces over the last 30 minutes is 12. That is above the warning threshold of 5."
        );
    }

    #[test]
    fn a_share_of_llm_calls_names_the_model() {
        let rule = rule(json!({
            "metric": "llm_no_cost_rate",
            "groupBy": "model",
            "window": { "minutes": 60 },
            "condition": { "type": "value" },
            "warning": 5,
        }));
        let opened = transition(TransitionKind::Opened, Level::Warning, 62.5);
        assert_eq!(
            message(&rule, "gpt-4o", &opened, &incident()).summary,
            "LLM calls with no cost for gpt-4o over the last hour is 62.5%. That is above the warning threshold of 5%."
        );
    }

    #[test]
    fn missing_data_is_said_plainly() {
        let rule = rule(json!({
            "metric": "total_cost",
            "window": { "minutes": 5 },
            "condition": { "type": "value" },
            "warning": 2.0,
            "resolve": 1.5,
            "onNoData": "alert",
        }));
        let mut opened = transition(TransitionKind::Opened, Level::Warning, 0.0);
        opened.value = None;
        opened.compared = None;
        let message = message(&rule, "", &opened, &incident());

        assert_eq!(message.summary, "No data in the last 5 minutes.");
        assert_eq!(message.details[0], detail("Value", "No data".to_string()));
    }

    #[test]
    fn traces_link_covers_the_incident_with_the_rule_filters() {
        let mut rule = cost_rule();
        rule.filters = vec![
            Filter {
                column: "user_id".to_string(),
                operator: "eq".to_string(),
                value: json!("user 1"),
            },
            Filter {
                column: "status".to_string(),
                operator: "eq".to_string(),
                value: json!("error"),
            },
        ];
        let opened = transition(TransitionKind::Opened, Level::Warning, 2.41);
        let message = message(&rule, "", &opened, &incident());

        // Opened at 19:12 after 3 checks a minute apart over 5 minute windows.
        assert_eq!(
            message.traces_path,
            "/project/00000000-0000-0000-0000-000000000001/traces?\
             startDate=2026-11-25T19%3A05%3A00Z&endDate=2026-11-25T19%3A35%3A00Z\
             &filter=%7B%22column%22%3A%22user_id%22%252C%22operator%22%3A%22eq%22%252C%22value%22%3A%22user+1%22%7D\
             %2C%7B%22column%22%3A%22status%22%252C%22operator%22%3A%22eq%22%252C%22value%22%3A%22error%22%7D\
             &sortBy=cost&sortDirection=desc"
        );
        assert_eq!(
            message.alert_path,
            "/project/00000000-0000-0000-0000-000000000001/settings/alerts/00000000-0000-0000-0000-000000000002"
        );
    }

    #[test]
    fn unstored_incident_has_no_message() {
        let rule = cost_rule();
        let opened = transition(TransitionKind::Opened, Level::Warning, 2.41);
        let mut unstored = incident();
        unstored.id = None;
        let subject = Subject {
            project_id: Uuid::from_u128(1),
            project_name: "prod",
            alert_id: Uuid::from_u128(2),
            alert_name: "Cost spike",
            rule: &rule,
            interval_minutes: 1,
            group: "",
        };
        let event = Event {
            transition: &opened,
            incident: &unstored,
            top_model: None,
        };
        assert!(build(&subject, &event).is_none());
    }
}
