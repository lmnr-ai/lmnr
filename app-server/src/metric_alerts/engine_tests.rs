use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::types::Json;
use uuid::Uuid;

use crate::{ch::span_metrics::SpanMetricsMinute, db::metric_alerts::MetricAlertIncidentRow};

use super::{
    engine::{Incident, Level, Observation, State, TransitionKind, evaluate},
    preview::replay,
    rule::Rule,
    series::{Context, Series, observe, time_of},
    store::{StateKey, to_state, to_state_row},
};

use Level::{Critical, Ok as Okay, Warning};
use TransitionKind::{Deescalated, Escalated, Opened, Reminder, Reopened, Resolved};

/// Total cost over 5 minutes: Warning above 100, Critical above 200, resolved
/// at 80, three checks in a row. `overrides` replaces top-level fields.
fn rule(overrides: Value) -> Rule {
    let mut rule = json!({
        "metric": "total_cost",
        "window": { "minutes": 5 },
        "condition": { "type": "value" },
        "warning": 100,
        "critical": 200,
        "resolve": 80
    });
    if let (Some(rule), Some(overrides)) = (rule.as_object_mut(), overrides.as_object()) {
        rule.extend(overrides.clone());
    }
    Rule::parse(&rule).unwrap()
}

fn below_rule(overrides: Value) -> Rule {
    let mut fields = json!({
        "metric": "trace_count",
        "direction": "below",
        "warning": 10,
        "critical": null,
        "resolve": 20
    });
    if let (Some(fields), Some(overrides)) = (fields.as_object_mut(), overrides.as_object()) {
        fields.extend(overrides.clone());
    }
    rule(fields)
}

fn change_rule(overrides: Value) -> Rule {
    let mut fields = json!({
        "condition": { "type": "change", "compareTo": "1w" },
        "warning": 130,
        "critical": 150,
        "resolve": 120
    });
    if let (Some(fields), Some(overrides)) = (fields.as_object_mut(), overrides.as_object()) {
        fields.extend(overrides.clone());
    }
    rule(fields)
}

fn budget_rule() -> Rule {
    rule(json!({
        "window": { "monthToDate": true },
        "condition": { "type": "budget", "amount": 1000 },
        "warning": null,
        "critical": null,
        "resolve": null,
        "checksInARow": 1
    }))
}

#[derive(Debug, Clone, Copy)]
struct Check {
    minute: i64,
    value: Option<f64>,
    baseline: Option<f64>,
    projected: Option<f64>,
    traces: u64,
    behind: bool,
}

fn check(minute: i64, value: f64) -> Check {
    Check {
        minute,
        value: Some(value),
        baseline: None,
        projected: None,
        traces: 1000,
        behind: false,
    }
}

fn no_data(minute: i64) -> Check {
    Check {
        value: None,
        traces: 0,
        ..check(minute, 0.0)
    }
}

/// One check per minute, starting at minute 0.
fn each_minute(values: &[f64]) -> Vec<Check> {
    values
        .iter()
        .enumerate()
        .map(|(minute, value)| check(minute as i64, *value))
        .collect()
}

fn with_baseline(checks: Vec<Check>, baseline: Option<f64>) -> Vec<Check> {
    checks
        .into_iter()
        .map(|c| Check { baseline, ..c })
        .collect()
}

fn with_traces(checks: Vec<Check>, traces: u64) -> Vec<Check> {
    checks.into_iter().map(|c| Check { traces, ..c }).collect()
}

fn behind(checks: Vec<Check>) -> Vec<Check> {
    checks
        .into_iter()
        .map(|c| Check { behind: true, ..c })
        .collect()
}

/// Moves checks so the first one lands on `minute`.
fn starting_at(minute: i64, checks: Vec<Check>) -> Vec<Check> {
    checks
        .into_iter()
        .map(|c| Check {
            minute: c.minute + minute,
            ..c
        })
        .collect()
}

fn observation(check: &Check) -> Observation {
    Observation {
        at: time_of(check.minute),
        value: check.value,
        baseline: check.baseline,
        projected: check.projected,
        traces: check.traces,
        ingestion_behind: check.behind,
    }
}

/// What a transition looked like: the minute, the kind, and the new level.
type Seen = (i64, TransitionKind, Level);

fn run_on(rule: &Rule, state: &mut State, checks: &[Check]) -> Vec<Seen> {
    checks
        .iter()
        .filter_map(|check| {
            evaluate(rule, state, &observation(check)).map(|t| (check.minute, t.kind, t.to))
        })
        .collect()
}

fn run(rule: &Rule, checks: &[Check]) -> Vec<Seen> {
    run_on(rule, &mut State::default(), checks)
}

struct Case {
    name: &'static str,
    rule: Rule,
    checks: Vec<Check>,
    expected: Vec<Seen>,
}

#[test]
fn transitions() {
    let cases = vec![
        Case {
            name: "a 2-check blip never fires",
            rule: rule(json!({})),
            checks: each_minute(&[10., 150., 150., 10., 150., 150., 10.]),
            expected: vec![],
        },
        Case {
            name: "3 checks in a row fire once",
            rule: rule(json!({})),
            checks: each_minute(&[10., 150., 150., 150., 150., 150., 150.]),
            expected: vec![(3, Opened, Warning)],
        },
        Case {
            name: "a value hovering at the line never fires",
            rule: rule(json!({})),
            checks: each_minute(&[101., 99., 101., 99., 101., 99., 101., 99.]),
            expected: vec![],
        },
        Case {
            name: "a value between resolve and warning keeps the incident open",
            rule: rule(json!({})),
            checks: each_minute(&[150., 150., 150., 99., 101., 99., 90., 85., 81., 99.]),
            expected: vec![(2, Opened, Warning)],
        },
        Case {
            name: "resolving needs its own 3 checks in a row",
            rule: rule(json!({})),
            checks: each_minute(&[150., 150., 150., 50., 50., 150., 50., 50., 50.]),
            expected: vec![(2, Opened, Warning), (8, Resolved, Okay)],
        },
        Case {
            name: "a value at the resolve threshold resolves",
            rule: rule(json!({})),
            checks: each_minute(&[150., 150., 150., 80., 80., 80.]),
            expected: vec![(2, Opened, Warning), (5, Resolved, Okay)],
        },
        Case {
            name: "a value at the warning threshold does not fire",
            rule: rule(json!({})),
            checks: each_minute(&[100., 100., 100., 100.]),
            expected: vec![],
        },
        Case {
            name: "escalates, steps down, then resolves",
            rule: rule(json!({})),
            checks: each_minute(&[
                150., 150., 150., 250., 250., 250., 150., 150., 150., 50., 50., 50.,
            ]),
            expected: vec![
                (2, Opened, Warning),
                (5, Escalated, Critical),
                (8, Deescalated, Warning),
                (11, Resolved, Okay),
            ],
        },
        Case {
            name: "opens straight at critical",
            rule: rule(json!({})),
            checks: each_minute(&[250., 250., 250.]),
            expected: vec![(2, Opened, Critical)],
        },
        Case {
            name: "the level rises only as far as every check in the streak agrees",
            rule: rule(json!({})),
            checks: each_minute(&[150., 250., 250., 250., 250., 250.]),
            expected: vec![(2, Opened, Warning), (5, Escalated, Critical)],
        },
        Case {
            name: "the level falls only as far as every check in the streak agrees",
            rule: rule(json!({})),
            checks: each_minute(&[250., 250., 250., 150., 50., 50., 50., 50., 50.]),
            expected: vec![
                (2, Opened, Critical),
                (5, Deescalated, Warning),
                (8, Resolved, Okay),
            ],
        },
        Case {
            name: "1 check in a row fires at once",
            rule: rule(json!({ "checksInARow": 1 })),
            checks: each_minute(&[10., 150., 10.]),
            expected: vec![(1, Opened, Warning), (2, Resolved, Okay)],
        },
        Case {
            name: "direction below fires under the threshold and resolves above",
            rule: below_rule(json!({})),
            checks: each_minute(&[50., 5., 5., 5., 15., 15., 15., 25., 25., 25.]),
            expected: vec![(3, Opened, Warning), (9, Resolved, Okay)],
        },
        Case {
            name: "a ratio on too few traces is not checked",
            rule: rule(json!({
                "metric": "error_rate", "warning": 5, "critical": null, "resolve": 2, "minTraces": 50
            })),
            checks: [
                with_traces(each_minute(&[100., 100., 100., 100.]), 49),
                with_traces(starting_at(4, each_minute(&[100., 100., 100.])), 50),
            ]
            .concat(),
            expected: vec![(6, Opened, Warning)],
        },
        Case {
            name: "minimum traces does not apply to sums",
            rule: rule(json!({ "minTraces": 50 })),
            checks: with_traces(each_minute(&[150., 150., 150.]), 1),
            expected: vec![(2, Opened, Warning)],
        },
        Case {
            name: "no data: skip leaves the rule alone",
            rule: below_rule(json!({ "onNoData": "skip" })),
            checks: (0..6).map(no_data).collect(),
            expected: vec![],
        },
        Case {
            name: "no data: skip keeps an open incident open",
            rule: rule(json!({ "onNoData": "skip" })),
            checks: [
                each_minute(&[150., 150., 150.]),
                (3..9).map(no_data).collect(),
            ]
            .concat(),
            expected: vec![(2, Opened, Warning)],
        },
        Case {
            name: "no data: a sum over nothing is zero unless the rule says otherwise",
            rule: below_rule(json!({})),
            checks: (0..3).map(no_data).collect(),
            expected: vec![(2, Opened, Warning)],
        },
        Case {
            name: "no data: a ratio over nothing is not checked unless the rule says otherwise",
            rule: below_rule(json!({ "metric": "tokens_per_trace" })),
            checks: (0..6).map(no_data).collect(),
            expected: vec![],
        },
        Case {
            name: "no data: zero reads as a value of 0",
            rule: below_rule(json!({ "onNoData": "zero" })),
            checks: (0..3).map(no_data).collect(),
            expected: vec![(2, Opened, Warning)],
        },
        Case {
            name: "no data: zero resolves a rule that alerts above",
            rule: rule(json!({ "onNoData": "zero" })),
            checks: [
                each_minute(&[150., 150., 150.]),
                (3..6).map(no_data).collect(),
            ]
            .concat(),
            expected: vec![(2, Opened, Warning), (5, Resolved, Okay)],
        },
        Case {
            name: "no data: alert opens at the highest level and data resolves it",
            rule: rule(json!({ "onNoData": "alert" })),
            checks: [
                (0..3).map(no_data).collect(),
                starting_at(3, each_minute(&[50., 50., 50.])),
            ]
            .concat(),
            expected: vec![(2, Opened, Critical), (5, Resolved, Okay)],
        },
        Case {
            name: "an empty or zero past window skips the check",
            rule: change_rule(json!({})),
            checks: [
                with_baseline(each_minute(&[100., 100., 100.]), None),
                with_baseline(starting_at(3, each_minute(&[100., 100., 100.])), Some(0.0)),
                with_baseline(starting_at(6, each_minute(&[100., 100., 100.])), Some(50.0)),
            ]
            .concat(),
            expected: vec![(8, Opened, Critical)],
        },
        Case {
            name: "change compares the percentage of the past window",
            rule: change_rule(json!({})),
            checks: with_baseline(
                each_minute(&[129., 140., 140., 140., 125., 125., 125., 120., 120., 120.]),
                Some(100.0),
            ),
            expected: vec![(3, Opened, Warning), (9, Resolved, Okay)],
        },
        Case {
            name: "minimum change blocks a tiny baseline",
            rule: change_rule(json!({ "minChange": 1.0 })),
            checks: with_baseline(each_minute(&[0.4, 0.4, 0.4, 0.4, 0.4]), Some(0.1)),
            expected: vec![],
        },
        Case {
            name: "the same jump fires without a minimum change",
            rule: change_rule(json!({})),
            checks: with_baseline(each_minute(&[0.4, 0.4, 0.4]), Some(0.1)),
            expected: vec![(2, Opened, Critical)],
        },
        Case {
            name: "a change past the minimum fires",
            rule: change_rule(json!({ "minChange": 1.0 })),
            checks: with_baseline(each_minute(&[4., 4., 4.]), Some(1.0)),
            expected: vec![(2, Opened, Critical)],
        },
        Case {
            name: "a single trace is compared to the p99 trace cost",
            rule: rule(json!({
                "metric": "trace_cost", "condition": { "type": "trace_p99" },
                "warning": 100, "critical": 300, "resolve": 100, "checksInARow": 1
            })),
            checks: with_baseline(each_minute(&[1., 2.5, 7., 1.]), Some(2.0)),
            expected: vec![
                (1, Opened, Warning),
                (2, Escalated, Critical),
                (3, Resolved, Okay),
            ],
        },
        Case {
            name: "ingestion behind: below rules are not checked",
            rule: below_rule(json!({})),
            checks: behind(each_minute(&[5., 5., 5., 5., 5.])),
            expected: vec![],
        },
        Case {
            name: "ingestion behind: missing data is not checked",
            rule: rule(json!({ "onNoData": "alert" })),
            checks: behind((0..5).map(no_data).collect()),
            expected: vec![],
        },
        Case {
            name: "ingestion behind: a low reading does not resolve",
            rule: rule(json!({})),
            checks: [
                each_minute(&[150., 150., 150.]),
                behind(starting_at(3, each_minute(&[50., 50., 50.]))),
                starting_at(6, each_minute(&[50., 50., 50.])),
            ]
            .concat(),
            expected: vec![(2, Opened, Warning), (8, Resolved, Okay)],
        },
        Case {
            name: "ingestion behind: a breach still fires",
            rule: rule(json!({})),
            checks: behind(each_minute(&[150., 150., 150.])),
            expected: vec![(2, Opened, Warning)],
        },
        Case {
            name: "duplicate and older timestamps are ignored",
            rule: rule(json!({})),
            checks: [1, 2, 2, 1, 2, 3]
                .into_iter()
                .map(|minute| check(minute, 150.0))
                .collect(),
            expected: vec![(3, Opened, Warning)],
        },
        Case {
            name: "reminders back off: 30 min, 30 min, 1 h, 2 h",
            rule: rule(json!({})),
            checks: (0..=300).map(|minute| check(minute, 150.0)).collect(),
            expected: vec![
                (2, Opened, Warning),
                (32, Reminder, Warning),
                (62, Reminder, Warning),
                (122, Reminder, Warning),
                (242, Reminder, Warning),
            ],
        },
        Case {
            name: "an escalation restarts the reminder back-off",
            rule: rule(json!({})),
            checks: (0..=160)
                .map(|minute| check(minute, if minute < 98 { 150.0 } else { 250.0 }))
                .collect(),
            expected: vec![
                (2, Opened, Warning),
                (32, Reminder, Warning),
                (62, Reminder, Warning),
                (100, Escalated, Critical),
                (130, Reminder, Critical),
                (160, Reminder, Critical),
            ],
        },
        Case {
            name: "skipped checks send no reminder",
            rule: rule(json!({ "onNoData": "skip" })),
            checks: [
                each_minute(&[150., 150., 150.]),
                (3..120).map(no_data).collect(),
            ]
            .concat(),
            expected: vec![(2, Opened, Warning)],
        },
    ];

    for case in cases {
        assert_eq!(
            run(&case.rule, &case.checks),
            case.expected,
            "{}",
            case.name
        );
    }
}

#[test]
fn budget_warns_on_pace_and_goes_critical_on_spend() {
    let budget = |hour: i64, spend: f64, projected: f64| Check {
        projected: Some(projected),
        ..check(hour * 60, spend)
    };
    let checks = [
        budget(0, 500.0, 900.0),
        // The projection passes the budget.
        budget(1, 600.0, 1100.0),
        // Back under the budget but above the resolve line (90%): still on pace.
        budget(2, 700.0, 950.0),
        // Actual spend reaches the budget.
        budget(3, 1000.0, 1200.0),
        // A new month.
        budget(4, 10.0, 300.0),
    ];

    assert_eq!(
        run(&budget_rule(), &checks),
        vec![
            (60, Opened, Warning),
            (120, Reminder, Warning),
            (180, Escalated, Critical),
            (240, Resolved, Okay),
        ]
    );
}

#[test]
fn a_breach_within_24h_reopens_the_same_incident() {
    let rule = rule(json!({}));
    let mut state = State::default();
    let breach = each_minute(&[150., 150., 150.]);
    let recovery = each_minute(&[50., 50., 50.]);

    let first = [breach.clone(), starting_at(3, recovery.clone())].concat();
    assert_eq!(
        run_on(&rule, &mut state, &first),
        vec![(2, Opened, Warning), (5, Resolved, Okay)]
    );

    // 23 h 59 min after resolving.
    let reopened_at = 5 + 24 * 60 - 1;
    let second = [
        starting_at(reopened_at - 2, breach.clone()),
        starting_at(reopened_at + 1, recovery),
    ]
    .concat();
    assert_eq!(
        run_on(&rule, &mut state, &second),
        vec![
            (reopened_at, Reopened, Warning),
            (reopened_at + 3, Resolved, Okay)
        ]
    );
    let incident = state.incident.clone().unwrap();
    assert_eq!(incident.opened_at, time_of(2));
    assert_eq!(incident.reopened_at, Some(time_of(reopened_at)));

    // Exactly 24 h after resolving, a breach is a new incident.
    let opened_at = reopened_at + 3 + 24 * 60;
    let third = starting_at(opened_at - 2, breach);
    assert_eq!(
        run_on(&rule, &mut state, &third),
        vec![(opened_at, Opened, Warning)]
    );
    let incident = state.incident.unwrap();
    assert_eq!(incident.opened_at, time_of(opened_at));
    assert_eq!(incident.reopened_at, None);
}

#[test]
fn a_duplicate_check_leaves_the_state_untouched() {
    let rule = rule(json!({}));
    let mut state = State::default();
    run_on(&rule, &mut state, &each_minute(&[150., 150.]));
    let before = state.clone();

    assert_eq!(
        run_on(&rule, &mut state, &[check(1, 150.0), check(0, 150.0)]),
        vec![]
    );
    assert_eq!(state, before);
    assert_eq!(state.streak_count, 2);
}

#[test]
fn the_incident_tracks_its_peak() {
    let rule = rule(json!({}));
    let mut state = State::default();
    run_on(
        &rule,
        &mut state,
        &each_minute(&[150., 150., 150., 180., 260., 120., 50., 50., 50.]),
    );

    let incident = state.incident.unwrap();
    assert_eq!(incident.peak_value, 260.0);
    // One check at 260 is not three in a row, so the level never moved.
    assert_eq!(incident.peak_level, Warning);
    assert_eq!(incident.resolved_at, Some(time_of(8)));
}

#[test]
fn a_muted_rule_keeps_its_state_but_never_notifies() {
    let rule = rule(json!({ "disabled": true }));
    let mut state = State::default();
    let checks: Vec<Check> = (0..=120).map(|minute| check(minute, 150.0)).collect();
    let transitions: Vec<_> = checks
        .iter()
        .filter_map(|check| evaluate(&rule, &mut state, &observation(check)))
        .collect();

    assert_eq!(transitions.len(), 1);
    assert_eq!(transitions[0].kind, Opened);
    assert!(!transitions[0].notify);
    assert_eq!(state.level, Warning);
    assert_eq!(state.incident.unwrap().last_notified_at, None);
}

#[test]
fn a_snoozed_rule_notifies_once_the_snooze_ends() {
    let rule = rule(json!({ "snoozedUntil": time_of(10) }));
    let mut state = State::default();
    let checks: Vec<Check> = (0..=45).map(|minute| check(minute, 150.0)).collect();
    let transitions: Vec<_> = checks
        .iter()
        .filter_map(|check| evaluate(&rule, &mut state, &observation(check)))
        .map(|t| (t.at, t.kind, t.notify))
        .collect();

    assert_eq!(
        transitions,
        vec![
            (time_of(2), Opened, false),
            // The first check after the snooze tells about the open incident.
            (time_of(10), Reminder, true),
            (time_of(40), Reminder, true),
        ]
    );
}

#[test]
fn an_incident_that_opened_and_resolved_in_silence_stays_silent() {
    let rule = rule(json!({ "snoozedUntil": time_of(5) }));
    let mut state = State::default();
    let checks = each_minute(&[150., 150., 150., 50., 50., 50.]);
    let transitions: Vec<_> = checks
        .iter()
        .filter_map(|check| evaluate(&rule, &mut state, &observation(check)))
        .map(|t| (t.kind, t.notify))
        .collect();

    // The resolving check runs after the snooze ended.
    assert_eq!(transitions, vec![(Opened, false), (Resolved, false)]);
}

#[test]
fn a_transition_carries_what_a_message_needs() {
    let rule = change_rule(json!({ "checksInARow": 1 }));
    let mut state = State::default();
    let breach = Check {
        baseline: Some(50.0),
        ..check(0, 100.0)
    };
    let transition = evaluate(&rule, &mut state, &observation(&breach)).unwrap();

    assert_eq!(transition.from, Okay);
    assert_eq!(transition.to, Critical);
    assert_eq!(transition.value, Some(100.0));
    assert_eq!(transition.compared, Some(200.0));
    assert_eq!(transition.baseline, Some(50.0));
    assert!(transition.notify);
}

fn incident_row(key: &StateKey<'_>, incident: &Incident) -> MetricAlertIncidentRow {
    MetricAlertIncidentRow {
        id: incident.id.unwrap_or_default(),
        project_id: key.project_id,
        alert_id: key.alert_id,
        group_key: key.group_key.to_string(),
        level: incident.level.as_str().to_string(),
        peak_level: incident.peak_level.as_str().to_string(),
        peak_value: incident.peak_value,
        opened_at: incident.opened_at,
        escalated_at: incident.escalated_at,
        reopened_at: incident.reopened_at,
        resolved_at: incident.resolved_at,
        last_notified_at: incident.last_notified_at,
        slack_threads: Json(HashMap::new()),
    }
}

/// Cost per minute: steady, a 2-minute blip, a sustained spike, a spike that
/// climbs to critical, and another breach soon after resolving.
fn recorded_series() -> Series {
    let cost_at = |minute: i64| match minute {
        40..42 => 45.0,
        80..110 => 30.0,
        150..160 => 30.0,
        160..190 => 70.0,
        230..250 => 30.0,
        _ => 2.0,
    };
    let rows: Vec<SpanMetricsMinute> = (0..300)
        .map(|minute| SpanMetricsMinute {
            minute: (minute * 60) as u32,
            model: "model-a".to_string(),
            total_cost: cost_at(minute),
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            llm_calls: 1,
        })
        .collect();
    let mut series = Series::default();
    series.add_span_rows(&rows);
    series
}

/// Runs the checks the way the scheduler does: one at a time, with the state
/// stored and loaded again between checks.
fn run_like_the_scheduler(rule: &Rule, series: &Series, minutes: &[i64]) -> Vec<Seen> {
    let fingerprint = rule.fingerprint();
    let key = StateKey {
        project_id: Uuid::new_v4(),
        alert_id: Uuid::new_v4(),
        group_key: "",
        fingerprint: &fingerprint,
    };
    let mut stored = None;
    let mut seen = Vec::new();

    for minute in minutes {
        let mut state = match &stored {
            Some((row, incident)) => to_state(row, Option::as_ref(incident)),
            None => State::default(),
        };
        let observation = observe(rule, series, None, *minute, Context::default());
        if let Some(transition) = evaluate(rule, &mut state, &observation) {
            seen.push((*minute, transition.kind, transition.to));
        }
        if let Some(incident) = state.incident.as_mut() {
            incident.id.get_or_insert_with(Uuid::new_v4);
        }
        let incident = state.incident.as_ref().map(|i| incident_row(&key, i));
        stored = Some((to_state_row(&key, &state), incident));
    }
    seen
}

fn minute_of(at: DateTime<Utc>) -> i64 {
    at.timestamp() / 60
}

#[test]
fn preview_and_scheduler_agree_on_a_recorded_series() {
    let rule = rule(json!({}));
    let series = recorded_series();
    let minutes: Vec<i64> = (5..300).collect();

    let scheduled: Vec<Seen> = run_like_the_scheduler(&rule, &series, &minutes)
        .into_iter()
        .filter(|(_, kind, _)| *kind != Reminder)
        .collect();
    let preview = replay(&rule, &series, None, &minutes, Context::default());
    let previewed: Vec<Seen> = preview
        .incidents
        .iter()
        .flat_map(|incident| &incident.transitions)
        .map(|t| (minute_of(t.at), t.kind, t.level))
        .collect();

    assert_eq!(previewed, scheduled);
    // Window sums: 5 x 30 = 150 is Warning, 5 x 70 = 350 is Critical. The
    // blip lifts the sum to 96, which stays under the line.
    assert_eq!(
        scheduled,
        vec![
            (86, Opened, Warning),
            (115, Resolved, Okay),
            (156, Reopened, Warning),
            (164, Escalated, Critical),
            (195, Deescalated, Warning),
            (198, Resolved, Okay),
            (236, Reopened, Warning),
            (255, Resolved, Okay),
        ]
    );
    assert_eq!(preview.incidents.len(), 1);
    assert_eq!(preview.incidents[0].peak_level, Critical);
    assert_eq!(preview.incidents[0].peak_value, 350.0);
    assert_eq!(preview.incidents[0].resolved_at, Some(time_of(255)));
}
