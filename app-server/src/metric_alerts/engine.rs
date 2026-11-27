//! Turns a stream of checks into incident transitions. No IO: the scheduler
//! and the preview both feed `evaluate` and get the same answer.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::rule::{Condition, Direction, OnNoData, Rule};

const REOPEN_WINDOW_HOURS: i64 = 24;
const REMINDER_MIN_GAP_MINUTES: i64 = 30;
const REMINDER_MAX_GAP_MINUTES: i64 = 24 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Level {
    Ok,
    Warning,
    Critical,
}

impl Level {
    pub fn as_str(self) -> &'static str {
        match self {
            Level::Ok => "ok",
            Level::Warning => "warning",
            Level::Critical => "critical",
        }
    }

    pub fn parse(value: &str) -> Level {
        match value {
            "warning" => Level::Warning,
            "critical" => Level::Critical,
            _ => Level::Ok,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Incident {
    /// `None` until the scheduler stores the incident.
    pub id: Option<Uuid>,
    pub level: Level,
    pub peak_level: Level,
    pub peak_value: f64,
    pub opened_at: DateTime<Utc>,
    pub escalated_at: Option<DateTime<Utc>>,
    pub reopened_at: Option<DateTime<Utc>>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub last_notified_at: Option<DateTime<Utc>>,
}

/// Everything `evaluate` remembers about one rule and group between checks.
#[derive(Debug, Clone, PartialEq)]
pub struct State {
    pub level: Level,
    /// Where the current run of disagreeing checks points, and how long it is.
    pub streak_level: Level,
    pub streak_count: u32,
    pub last_processed_at: Option<DateTime<Utc>>,
    pub last_value: Option<f64>,
    /// The open incident, or the last one while it can still reopen.
    pub incident: Option<Incident>,
}

impl Default for State {
    fn default() -> Self {
        State {
            level: Level::Ok,
            streak_level: Level::Ok,
            streak_count: 0,
            last_processed_at: None,
            last_value: None,
            incident: None,
        }
    }
}

/// One check of one rule and group.
#[derive(Debug, Clone, PartialEq)]
pub struct Observation {
    /// End of the window that was measured.
    pub at: DateTime<Utc>,
    /// `None` when nothing matched in the window.
    pub value: Option<f64>,
    /// What a `change` condition divides by: the past window.
    pub baseline: Option<f64>,
    /// LLM calls (or spans) in the window, which `min_calls` is compared to.
    pub volume: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransitionKind {
    Opened,
    Escalated,
    Deescalated,
    Resolved,
    Reopened,
    Reminder,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Transition {
    pub kind: TransitionKind,
    pub from: Level,
    pub to: Level,
    pub at: DateTime<Utc>,
    /// The metric value, `None` when the rule alerted on missing data.
    pub value: Option<f64>,
    /// The number held against the thresholds: the value itself, or a
    /// percentage of the baseline.
    pub compared: Option<f64>,
    pub baseline: Option<f64>,
    /// False while the rule is snoozed or muted.
    pub notify: bool,
}

/// The number a check holds against the thresholds, when it has one.
pub fn compared_value(rule: &Rule, observation: &Observation) -> Option<f64> {
    let value = observation.value?;
    if !rule.is_relative() {
        return Some(value);
    }
    let baseline = observation.baseline.filter(|b| *b > 0.0)?;
    Some(value / baseline * 100.0)
}

/// What one check says, before the checks-in-a-row rule is applied.
struct Reading {
    level: Level,
    value: Option<f64>,
    compared: Option<f64>,
}

fn highest_level(rule: &Rule) -> Level {
    if rule.critical.is_some() {
        Level::Critical
    } else {
        Level::Warning
    }
}

/// How far `compared` is past `threshold` in the alerting direction.
fn past(rule: &Rule, compared: f64, threshold: f64) -> f64 {
    match rule.direction {
        Direction::Above => compared - threshold,
        Direction::Below => threshold - compared,
    }
}

/// The level a single number asks for. While firing, only the resolve
/// threshold leads back to OK.
fn threshold_level(rule: &Rule, current: Level, compared: f64) -> Level {
    let breaches = |threshold: f64| past(rule, compared, threshold) > 0.0;
    if rule.critical.is_some_and(breaches) {
        Level::Critical
    } else if rule.warning.is_some_and(breaches) {
        Level::Warning
    } else if current != Level::Ok && past(rule, compared, rule.resolve_threshold()) > 0.0 {
        match rule.warning {
            Some(_) => Level::Warning,
            None => current,
        }
    } else {
        Level::Ok
    }
}

/// `None` when the check cannot say anything and must leave the state alone.
fn read(rule: &Rule, current: Level, observation: &Observation) -> Option<Reading> {
    let value = match (observation.value, rule.no_data_mode()) {
        (Some(value), _) => value,
        (None, OnNoData::Skip) => return None,
        (None, OnNoData::Zero) => 0.0,
        (None, OnNoData::Alert) => {
            return Some(Reading {
                level: highest_level(rule),
                value: None,
                compared: None,
            });
        }
    };
    let has_data = observation.value.is_some();
    if has_data && rule.metric.needs_min_calls() && observation.volume < rule.min_calls {
        return None;
    }

    let (level, compared) = match rule.condition {
        Condition::Value => (threshold_level(rule, current, value), value),
        Condition::Change { .. } => {
            let baseline = observation.baseline.filter(|b| *b > 0.0)?;
            let percent = value / baseline * 100.0;
            let too_small = rule
                .min_change
                .is_some_and(|min| (value - baseline).abs() < min);
            let level = if too_small {
                Level::Ok
            } else {
                threshold_level(rule, current, percent)
            };
            (level, percent)
        }
    };

    Some(Reading {
        level,
        value: has_data.then_some(value),
        compared: Some(compared),
    })
}

/// Applies the checks-in-a-row rule. Returns the new level once enough
/// consecutive checks agree that the level should move the same way.
fn advance(state: &mut State, reading: Level, checks_in_a_row: u32) -> Option<Level> {
    if reading == state.level {
        state.streak_level = state.level;
        state.streak_count = 0;
        return None;
    }

    let rising = reading > state.level;
    let continues = state.streak_count > 0 && (state.streak_level > state.level) == rising;
    if continues {
        // Move only as far as every check in the streak agrees on.
        state.streak_level = if rising {
            state.streak_level.min(reading)
        } else {
            state.streak_level.max(reading)
        };
        state.streak_count += 1;
    } else {
        state.streak_level = reading;
        state.streak_count = 1;
    }

    if state.streak_count < checks_in_a_row {
        return None;
    }
    state.level = state.streak_level;
    state.streak_count = 0;
    Some(state.level)
}

fn reminder_due(incident: &Incident, at: DateTime<Utc>) -> bool {
    let Some(last_notified_at) = incident.last_notified_at else {
        return true;
    };
    let last_change = [incident.escalated_at, incident.reopened_at]
        .into_iter()
        .flatten()
        .fold(incident.opened_at, DateTime::max);
    // Each reminder waits as long as the incident had been quiet at the
    // previous one, so the gap doubles: 30 min, 1 h, 2 h, up to a day.
    let gap = (last_notified_at - last_change).clamp(
        Duration::minutes(REMINDER_MIN_GAP_MINUTES),
        Duration::minutes(REMINDER_MAX_GAP_MINUTES),
    );
    at - last_notified_at >= gap
}

fn apply_level_change(
    state: &mut State,
    from: Level,
    to: Level,
    at: DateTime<Utc>,
    compared: f64,
) -> TransitionKind {
    if from == Level::Ok {
        let reopen_after = at - Duration::hours(REOPEN_WINDOW_HOURS);
        let reopens = state
            .incident
            .as_ref()
            .and_then(|incident| incident.resolved_at)
            .is_some_and(|resolved_at| resolved_at > reopen_after);
        if let (true, Some(incident)) = (reopens, state.incident.as_mut()) {
            incident.resolved_at = None;
            incident.reopened_at = Some(at);
            incident.level = to;
            return TransitionKind::Reopened;
        }
        state.incident = Some(Incident {
            id: None,
            level: to,
            peak_level: to,
            peak_value: compared,
            opened_at: at,
            escalated_at: None,
            reopened_at: None,
            resolved_at: None,
            last_notified_at: None,
        });
        return TransitionKind::Opened;
    }

    let kind = if to == Level::Ok {
        TransitionKind::Resolved
    } else if to > from {
        TransitionKind::Escalated
    } else {
        TransitionKind::Deescalated
    };
    if let Some(incident) = state.incident.as_mut() {
        incident.level = to;
        match kind {
            TransitionKind::Resolved => incident.resolved_at = Some(at),
            TransitionKind::Escalated => incident.escalated_at = Some(at),
            _ => {}
        }
    }
    kind
}

fn track_peak(rule: &Rule, state: &mut State, compared: Option<f64>) {
    let level = state.level;
    let Some(incident) = state.incident.as_mut().filter(|i| i.resolved_at.is_none()) else {
        return;
    };
    incident.peak_level = incident.peak_level.max(level);
    if let Some(compared) = compared
        && past(rule, compared, incident.peak_value) > 0.0
    {
        incident.peak_value = compared;
    }
}

/// Processes one check. Returns what, if anything, happened to the incident.
pub fn evaluate(rule: &Rule, state: &mut State, observation: &Observation) -> Option<Transition> {
    if state
        .last_processed_at
        .is_some_and(|last| observation.at <= last)
    {
        return None;
    }
    state.last_processed_at = Some(observation.at);

    let reading = read(rule, state.level, observation)?;
    state.last_value = reading.compared;

    let from = state.level;
    let changed = advance(state, reading.level, rule.checks_in_a_row);
    let kind = match changed {
        Some(to) => Some(apply_level_change(
            state,
            from,
            to,
            observation.at,
            reading.compared.unwrap_or(0.0),
        )),
        None => None,
    };
    track_peak(rule, state, reading.compared);

    let paused = rule.notifications_paused(observation.at);
    let kind = match kind {
        Some(kind) => kind,
        None => {
            let open = state
                .incident
                .as_ref()
                .filter(|i| i.resolved_at.is_none())?;
            if paused || !reminder_due(open, observation.at) {
                return None;
            }
            TransitionKind::Reminder
        }
    };
    // Nobody was told about an incident that opened and resolved in silence.
    let unannounced = state
        .incident
        .as_ref()
        .is_some_and(|incident| incident.last_notified_at.is_none());
    let notify = !paused && !(kind == TransitionKind::Resolved && unannounced);
    if let (true, Some(incident)) = (notify, state.incident.as_mut()) {
        incident.last_notified_at = Some(observation.at);
    }

    Some(Transition {
        kind,
        from,
        to: state.level,
        at: observation.at,
        value: reading.value,
        compared: reading.compared,
        baseline: observation.baseline,
        notify,
    })
}
