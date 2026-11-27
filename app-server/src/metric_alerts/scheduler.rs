//! Checks every metric rule on its grid. Each replica ticks once a minute and
//! the one holding the lock does the work.

use std::{
    collections::HashMap,
    future::Future,
    sync::Arc,
    time::{Duration, Instant},
};

use chrono::Utc;
use futures_util::{StreamExt, stream};
use sqlx::PgPool;
use tokio::time::{self, MissedTickBehavior};
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{METRIC_ALERTS_LAST_MINUTE_CACHE_KEY, METRIC_ALERTS_SCHEDULER_LOCK_CACHE_KEY},
    },
    db::metric_alerts::{MetricAlertRow, get_all_metric_alerts},
    env::metric_alerts::METRIC_ALERTS_SETTLE_MINUTES,
    mq::MessageQueue,
    notifications::{
        NotificationDefinitionType, NotificationKind, NotificationMessage,
        push_to_notification_queue,
    },
};

use super::{
    cadence::{check_interval_minutes, is_due},
    engine::{State, Transition, evaluate},
    ingestion,
    message::{self, Event, Subject},
    query::fetch_series,
    rule::{GroupBy, Rule},
    series::{Series, observe, ranges_of, window_of},
    store::{self, StateKey},
};

const TICK_INTERVAL_SECONDS: u64 = 60;
// Safety net in case the holder crashes; a normal tick releases the lock.
const LOCK_TTL_SECONDS: u64 = 300;
/// Missed minutes one tick checks. A longer gap takes several ticks.
const MAX_MINUTES_PER_TICK: i64 = 15;
/// Missed minutes older than this are skipped.
const MAX_REPLAY_MINUTES: i64 = 3 * 60;
/// A marker further ahead of the clock was written by a clock that ran ahead.
const MAX_MARKER_AHEAD_MINUTES: i64 = 10;
/// Checks wait for ingestion, so a stuck pipeline shows up here and not as
/// an alert.
const DATA_CLOCK_BEHIND_ERROR_MINUTES: i64 = 10;
const SLOW_TICK_SECONDS: u64 = 30;
const PROJECT_CONCURRENCY: usize = 8;

struct MetricAlert {
    row: MetricAlertRow,
    rule: Rule,
    fingerprint: String,
    interval_minutes: i64,
}

struct Tick<'a> {
    pool: &'a PgPool,
    clickhouse: &'a clickhouse::Client,
    queue: &'a Arc<MessageQueue>,
}

/// Runs `work` unless another replica holds the scheduler lock. Returns
/// whether it ran.
async fn run_exclusive<F>(cache: &Cache, work: F) -> bool
where
    F: Future<Output = ()>,
{
    match cache
        .try_acquire_lock(METRIC_ALERTS_SCHEDULER_LOCK_CACHE_KEY, LOCK_TTL_SECONDS)
        .await
    {
        Ok(true) => {
            work.await;
            if let Err(e) = cache
                .release_lock(METRIC_ALERTS_SCHEDULER_LOCK_CACHE_KEY)
                .await
            {
                log::warn!("[Metric alerts] Failed to release lock: {:?}", e);
            }
            true
        }
        Ok(false) => false,
        Err(e) => {
            log::warn!("[Metric alerts] Failed to acquire lock: {:?}", e);
            false
        }
    }
}

pub async fn run_metric_alerts_scheduler(
    pool: PgPool,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    cache: Arc<Cache>,
) {
    log::debug!("[Metric alerts] Starting scheduler");
    let mut interval = time::interval(Duration::from_secs(TICK_INTERVAL_SECONDS));
    interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        interval.tick().await;
        run_exclusive(&cache, async {
            if let Err(e) = run_tick(&pool, &clickhouse, &queue, &cache).await {
                log::error!("[Metric alerts] Tick failed: {:?}", e);
            }
        })
        .await;
    }
}

async fn load_alerts(pool: &PgPool) -> anyhow::Result<Vec<MetricAlert>> {
    let alerts = get_all_metric_alerts(pool)
        .await?
        .into_iter()
        .filter_map(|row| match Rule::parse(&row.metadata) {
            Ok(rule) => Some(MetricAlert {
                fingerprint: rule.fingerprint(),
                interval_minutes: check_interval_minutes(&rule),
                rule,
                row,
            }),
            Err(e) => {
                log::warn!("[Metric alerts] Skipping invalid rule {}: {}", row.id, e);
                None
            }
        })
        .collect();

    Ok(alerts)
}

/// The newest window end whose spans are all stored: `wall_target`, or the
/// minute before the oldest batch a consumer is still storing if that is
/// earlier.
fn target_minute(wall_target: i64, oldest_in_flight_ms: Option<i64>) -> i64 {
    match oldest_in_flight_ms {
        Some(accepted_at_ms) => wall_target.min(accepted_at_ms.div_euclid(60_000) - 1),
        None => wall_target,
    }
}

/// The minutes one tick checks, in order. Empty when `first > last`.
#[derive(Debug, PartialEq)]
struct Replay {
    first: i64,
    last: i64,
    /// Missed minutes before `first` that were too old to check.
    skipped: i64,
}

/// Continues after the last checked minute, up to `target`. A marker ahead of
/// `target` leaves nothing to do: the data clock went back, or another
/// replica's clock is slightly ahead.
fn replay(marker: Option<i64>, target: i64, wall_target: i64) -> Replay {
    let marker = marker.filter(|marker| marker - wall_target <= MAX_MARKER_AHEAD_MINUTES);
    let Some(marker) = marker else {
        return Replay {
            first: target,
            last: target,
            skipped: 0,
        };
    };
    let first = (marker + 1).max(target - MAX_REPLAY_MINUTES + 1);
    Replay {
        first,
        last: target.min(first + MAX_MINUTES_PER_TICK - 1),
        skipped: first - (marker + 1),
    }
}

async fn run_tick(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    queue: &Arc<MessageQueue>,
    cache: &Cache,
) -> anyhow::Result<()> {
    let started = Instant::now();
    let wall_target = Utc::now().timestamp().div_euclid(60) - METRIC_ALERTS_SETTLE_MINUTES.get();
    let target = target_minute(wall_target, ingestion::oldest_in_flight(cache).await?);
    if wall_target - target > DATA_CLOCK_BEHIND_ERROR_MINUTES {
        log::error!(
            "[Metric alerts] Span ingestion is {} minutes behind, checks wait for it",
            wall_target - target
        );
    }
    let marker = cache
        .get::<i64>(METRIC_ALERTS_LAST_MINUTE_CACHE_KEY)
        .await?;
    let replay = replay(marker, target, wall_target);
    if replay.skipped > 0 {
        log::warn!(
            "[Metric alerts] Skipped {} missed minutes older than {} minutes, before minute {}",
            replay.skipped,
            MAX_REPLAY_MINUTES,
            replay.first
        );
    }

    let alerts = load_alerts(pool).await?;
    let tick = Tick {
        pool,
        clickhouse,
        queue,
    };

    let mut rules_due = 0;
    for minute in replay.first..=replay.last {
        let mut due: HashMap<Uuid, Vec<&MetricAlert>> = HashMap::new();
        for alert in &alerts {
            if is_due(&alert.row.id, alert.interval_minutes, minute) {
                due.entry(alert.row.project_id).or_default().push(alert);
                rules_due += 1;
            }
        }
        stream::iter(due)
            .for_each_concurrent(PROJECT_CONCURRENCY, |(project_id, alerts)| {
                check_project(&tick, project_id, alerts, minute)
            })
            .await;
        cache
            .insert(METRIC_ALERTS_LAST_MINUTE_CACHE_KEY, minute)
            .await?;
    }

    let elapsed = started.elapsed();
    let summary = format!(
        "[Metric alerts] Tick: {} rules loaded, {} due over {} minutes up to {}, took {} ms",
        alerts.len(),
        rules_due,
        (replay.last - replay.first + 1).max(0),
        replay.last,
        elapsed.as_millis()
    );
    if elapsed.as_secs() > SLOW_TICK_SECONDS {
        log::warn!("{summary}, slower than {SLOW_TICK_SECONDS} s");
    } else {
        log::info!("{summary}");
    }

    Ok(())
}

async fn check_project(tick: &Tick<'_>, project_id: Uuid, alerts: Vec<&MetricAlert>, minute: i64) {
    let ranges = alerts
        .iter()
        .flat_map(|alert| ranges_of(&alert.rule, minute))
        .collect();
    let series = match fetch_series(tick.clickhouse, &project_id, ranges).await {
        Ok(series) => series,
        Err(e) => {
            log::error!(
                "[Metric alerts] Failed to read metrics for project {}: {:?}",
                project_id,
                e
            );
            return;
        }
    };

    for alert in alerts {
        if let Err(e) = check_alert(tick, alert, &series, minute).await {
            log::error!(
                "[Metric alerts] Failed to check rule {}: {:?}",
                alert.row.id,
                e
            );
        }
    }
}

/// The groups to check: the whole project, or the top models of the window
/// plus every model that is firing or building up to a change.
fn groups(
    rule: &Rule,
    series: &Series,
    minute: i64,
    states: &HashMap<String, State>,
) -> Vec<String> {
    match rule.group_by {
        None => vec![String::new()],
        Some(GroupBy::Model) => {
            let mut groups = series.top_models(rule, window_of(rule, minute));
            for (group, state) in states {
                let active = state
                    .incident
                    .as_ref()
                    .is_some_and(|i| i.resolved_at.is_none())
                    || state.streak_count > 0;
                if active && !groups.contains(group) {
                    groups.push(group.clone());
                }
            }
            groups
        }
    }
}

async fn check_alert(
    tick: &Tick<'_>,
    alert: &MetricAlert,
    series: &Series,
    minute: i64,
) -> anyhow::Result<()> {
    let project_id = alert.row.project_id;
    let mut states =
        store::load_states(tick.pool, &project_id, &alert.row.id, &alert.fingerprint).await?;

    for group in groups(&alert.rule, series, minute, &states) {
        let mut state = states.remove(&group).unwrap_or_default();
        let before = state.clone();
        let model = alert.rule.group_by.map(|_| group.as_str());
        let observation = observe(&alert.rule, series, model, minute);
        let transition = evaluate(&alert.rule, &mut state, &observation);
        if state == before {
            continue;
        }

        let key = StateKey {
            project_id,
            alert_id: alert.row.id,
            group_key: &group,
            fingerprint: &alert.fingerprint,
        };
        // Another replica already stored this check and owns its transition.
        if !store::save(tick.pool, &key, &before, &mut state).await? {
            continue;
        }
        let Some(transition) = transition else {
            continue;
        };
        log_transition(alert, &group, &transition);
        if let (true, Some(incident)) = (transition.notify, &state.incident) {
            let top_model = message::names_top_model(&alert.rule, &transition)
                .then(|| series.top_contributor(&alert.rule, window_of(&alert.rule, minute)))
                .flatten();
            let event = Event {
                transition: &transition,
                incident,
                top_model,
                sent_at: Utc::now(),
            };
            notify(tick, alert, &group, &event).await;
        }
    }

    Ok(())
}

fn log_transition(alert: &MetricAlert, group: &str, transition: &Transition) {
    log::info!(
        "[Metric alerts] Rule {} ({}) group '{}': {:?} {} -> {} at {}, value {:?}",
        alert.row.id,
        alert.row.name,
        group,
        transition.kind,
        transition.from.as_str(),
        transition.to.as_str(),
        transition.at,
        transition.compared,
    );
}

/// Hands the transition to the notification pipeline. The state is already
/// stored, so a failed publish loses this message instead of repeating it.
async fn notify(tick: &Tick<'_>, alert: &MetricAlert, group: &str, event: &Event<'_>) {
    let subject = Subject {
        project_id: alert.row.project_id,
        project_name: &alert.row.project_name,
        alert_id: alert.row.id,
        alert_name: &alert.row.name,
        rule: &alert.rule,
        interval_minutes: alert.interval_minutes,
        group,
    };
    let Some(notification) = message::build(&subject, event) else {
        return;
    };
    let message = NotificationMessage {
        definition_type: NotificationDefinitionType::Alert,
        definition_id: alert.row.id,
        workspace_id: alert.row.workspace_id,
        project_id: Some(alert.row.project_id),
        notifications: vec![NotificationKind::MetricAlert(notification)],
    };
    if let Err(e) = push_to_notification_queue(message, tick.queue.clone()).await {
        log::error!(
            "[Metric alerts] Failed to publish {:?} for rule {}: {:?}",
            event.transition.kind,
            alert.row.id,
            e
        );
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use crate::cache::in_memory::InMemoryCache;

    use super::*;

    #[test]
    fn the_target_waits_for_the_oldest_batch_in_flight() {
        let minute_ms = 60_000;
        assert_eq!(target_minute(100, None), 100);
        // A batch accepted in minute 90 can still add spans to minute 90.
        assert_eq!(target_minute(100, Some(90 * minute_ms + 59_999)), 89);
        assert_eq!(target_minute(100, Some(90 * minute_ms)), 89);
        // A fresh batch does not move the clock past the settle time.
        assert_eq!(target_minute(100, Some(102 * minute_ms)), 100);
    }

    #[test]
    fn a_tick_replays_missed_minutes_in_order() {
        let range = |marker, target| {
            let replay = replay(marker, target, target);
            (replay.first, replay.last, replay.skipped)
        };
        assert_eq!(range(None, 1000), (1000, 1000, 0));
        assert_eq!(range(Some(999), 1000), (1000, 1000, 0));
        assert_eq!(range(Some(990), 1000), (991, 1000, 0));
        // At most 15 minutes a tick, the rest on the next ones.
        assert_eq!(range(Some(900), 1000), (901, 915, 0));
        assert_eq!(range(Some(915), 1000), (916, 930, 0));
        // Three hours back at most.
        assert_eq!(range(Some(820), 1000), (821, 835, 0));
        assert_eq!(range(Some(500), 1000), (821, 835, 320));
    }

    #[test]
    fn a_marker_ahead_of_the_target_leaves_nothing_to_do() {
        // Already checked.
        let done = replay(Some(1000), 1000, 1000);
        assert!(done.first > done.last);
        // The data clock went back behind checked minutes.
        let back = replay(Some(1000), 940, 1000);
        assert!(back.first > back.last);
        assert_eq!(back.skipped, 0);
        // A marker far ahead of the wall clock is dropped.
        let ahead = replay(Some(1500), 1000, 1000);
        assert_eq!((ahead.first, ahead.last), (1000, 1000));
    }

    #[tokio::test]
    async fn only_one_replica_runs_a_tick() {
        let cache = Cache::InMemory(InMemoryCache::new(None));
        let ticks = AtomicUsize::new(0);
        let tick = || async {
            ticks.fetch_add(1, Ordering::SeqCst);
            time::sleep(Duration::from_millis(50)).await;
        };

        let (first, second) =
            tokio::join!(run_exclusive(&cache, tick()), run_exclusive(&cache, tick()));

        assert!(first != second, "exactly one replica runs");
        assert_eq!(ticks.load(Ordering::SeqCst), 1);
        // The lock is released, so the next tick runs again.
        assert!(run_exclusive(&cache, tick()).await);
    }
}
