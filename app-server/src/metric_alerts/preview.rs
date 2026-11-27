//! Replays a rule over recent history with the same grid, the same series
//! and the same engine the scheduler uses.

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::env::metric_alerts::METRIC_ALERTS_SETTLE_MINUTES;

use super::{
    cadence::{check_interval_minutes, is_due},
    engine::{Level, Observation, State, TransitionKind, compared_value, evaluate},
    query::fetch_series,
    rule::{Direction, GroupBy, Rule},
    series::{Context, Minutes, Series, observe, ranges_of, window_of},
};

pub const MAX_PREVIEW_HOURS: i64 = 7 * 24;
/// Points returned per group. Longer replays keep the most extreme value of
/// each stretch, so a spike stays visible, and always the newest point.
const MAX_POINTS: usize = 600;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    pub at: DateTime<Utc>,
    /// The number held against the thresholds, with an empty window read as
    /// zero. `None` only when a relative condition has nothing to compare to.
    pub value: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionPreview {
    pub kind: TransitionKind,
    pub level: Level,
    pub at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncidentPreview {
    pub opened_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub peak_level: Level,
    pub peak_value: f64,
    pub transitions: Vec<TransitionPreview>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupPreview {
    pub group: String,
    pub points: Vec<Point>,
    pub incidents: Vec<IncidentPreview>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub check_interval_minutes: i64,
    /// Longest time from the value crossing a threshold to the alert: a full
    /// interval may pass before the first breaching check.
    pub fires_after_minutes: i64,
    /// Incidents opened or reopened in the replayed range.
    pub fired_count: usize,
    pub groups: Vec<GroupPreview>,
}

/// The chart draws a window without data as zero, whatever the rule's
/// `onNoData` does with it, so a quiet stretch is a flat line and not a hole.
fn point_of(rule: &Rule, observation: &Observation) -> Point {
    let filled = Observation {
        value: observation.value.or(Some(0.0)),
        ..observation.clone()
    };
    Point {
        at: observation.at,
        value: compared_value(rule, &filled),
    }
}

fn more_extreme(rule: &Rule, candidate: &Point, current: &Point) -> bool {
    match (candidate.value, current.value) {
        (Some(candidate), Some(current)) => match rule.direction {
            Direction::Above => candidate > current,
            Direction::Below => candidate < current,
        },
        (Some(_), None) => true,
        _ => false,
    }
}

fn downsample(rule: &Rule, mut points: Vec<Point>) -> Vec<Point> {
    if points.len() <= MAX_POINTS {
        return points;
    }
    // The newest point is kept as it is, so the chart ends at the latest check.
    let newest = points.pop();
    let stride = points.len().div_ceil(MAX_POINTS - 1).max(1);
    let mut sampled: Vec<Point> = Vec::with_capacity(MAX_POINTS);
    for (index, point) in points.into_iter().enumerate() {
        match sampled.last_mut() {
            Some(last) if index % stride != 0 => {
                if more_extreme(rule, &point, last) {
                    *last = point;
                }
            }
            _ => sampled.push(point),
        }
    }
    sampled.extend(newest);
    sampled
}

/// Replays one group over `minutes`, the window ends of its checks. `newest`
/// is the latest settled minute: when the last check is older, the window
/// ending there is plotted too, without being evaluated, so the chart does not
/// trail the data by up to a check interval.
pub fn replay(
    rule: &Rule,
    series: &Series,
    group: Option<&str>,
    minutes: &[i64],
    newest: i64,
    context: Context,
) -> GroupPreview {
    let mut state = State::default();
    let mut points = Vec::with_capacity(minutes.len());
    let mut incidents: Vec<IncidentPreview> = Vec::new();

    for minute in minutes {
        let observation = observe(rule, series, group, *minute, context);
        let transition = evaluate(rule, &mut state, &observation);
        points.push(point_of(rule, &observation));

        if let (Some(transition), Some(incident)) = (&transition, &state.incident) {
            if transition.kind == TransitionKind::Opened {
                incidents.push(IncidentPreview {
                    opened_at: incident.opened_at,
                    resolved_at: None,
                    peak_level: incident.peak_level,
                    peak_value: incident.peak_value,
                    transitions: Vec::new(),
                });
            }
            if let (Some(last), true) = (
                incidents.last_mut(),
                transition.kind != TransitionKind::Reminder,
            ) {
                last.resolved_at = incident.resolved_at;
                last.transitions.push(TransitionPreview {
                    kind: transition.kind,
                    level: transition.to,
                    at: transition.at,
                });
            }
        }
        if let (Some(last), Some(incident)) = (incidents.last_mut(), &state.incident) {
            last.peak_level = incident.peak_level;
            last.peak_value = incident.peak_value;
        }
    }
    if minutes.last().is_some_and(|last| *last < newest) {
        let observation = observe(rule, series, group, newest, context);
        points.push(point_of(rule, &observation));
    }

    GroupPreview {
        group: group.unwrap_or_default().to_string(),
        points: downsample(rule, points),
        incidents,
    }
}

/// The window ends a rule is checked at during the `hours` before `newest`.
fn check_minutes(alert_id: &Uuid, interval_minutes: i64, hours: i64, newest: i64) -> Vec<i64> {
    (newest - hours * 60..=newest)
        .filter(|minute| is_due(alert_id, interval_minutes, *minute))
        .collect()
}

/// Replays `rule` over the last `hours`. `alert_id` picks the same check grid
/// the scheduler uses for a saved rule.
pub async fn preview(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    rule: &Rule,
    alert_id: &Uuid,
    hours: i64,
) -> anyhow::Result<Preview> {
    // Snooze and mute only stop messages, and a preview sends none.
    let mut rule = rule.clone();
    rule.snoozed_until = None;
    rule.disabled = false;

    let interval = check_interval_minutes(&rule);
    let newest = Utc::now().timestamp().div_euclid(60) - METRIC_ALERTS_SETTLE_MINUTES.get();
    let hours = hours.clamp(1, MAX_PREVIEW_HOURS);
    let minutes = check_minutes(alert_id, interval, hours, newest);
    let Some(first) = minutes.first().copied() else {
        anyhow::bail!("No checks in the preview range");
    };

    let plotted = minutes.iter().chain([&newest]);
    let ranges = plotted.flat_map(|m| ranges_of(&rule, *m)).collect();
    let series = fetch_series(clickhouse, project_id, ranges).await?;
    let context = Context::default();

    let groups: Vec<GroupPreview> = match rule.group_by {
        None => vec![replay(&rule, &series, None, &minutes, newest, context)],
        Some(GroupBy::Model) => {
            let whole_range = Minutes {
                start: window_of(&rule, first).start,
                end: newest,
            };
            series
                .top_models(&rule, whole_range)
                .iter()
                .map(|model| replay(&rule, &series, Some(model), &minutes, newest, context))
                .collect()
        }
    };

    let fired_count = groups
        .iter()
        .flat_map(|group| &group.incidents)
        .flat_map(|incident| &incident.transitions)
        .filter(|t| matches!(t.kind, TransitionKind::Opened | TransitionKind::Reopened))
        .count();

    Ok(Preview {
        check_interval_minutes: interval,
        fires_after_minutes: interval * rule.checks_in_a_row as i64,
        fired_count,
        groups,
    })
}
