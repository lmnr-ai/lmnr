//! Checks every metric rule on its grid. Each replica ticks once a minute and
//! the one holding the lock does the work.

use std::{collections::HashMap, future::Future, sync::Arc, time::Duration};

use chrono::Utc;
use futures_util::{StreamExt, stream};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tokio::time::{self, MissedTickBehavior};
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{
            METRIC_ALERT_TRACE_COST_P99_CACHE_KEY, METRIC_ALERTS_LAST_MINUTE_CACHE_KEY,
            METRIC_ALERTS_SCHEDULER_LOCK_CACHE_KEY,
        },
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
    query::{RuleChecks, fetch_series, get_trace_cost_p99},
    rule::{Condition, GroupBy, Rule},
    series::{Context, Minutes, Series, observe, ranges_of, window_of},
    store::{self, StateKey},
};

const TICK_INTERVAL_SECONDS: u64 = 60;
// Safety net in case the holder crashes; a normal tick releases the lock.
const LOCK_TTL_SECONDS: u64 = 300;
/// Minutes a late tick goes back to check. Older minutes are dropped.
const MAX_CATCH_UP_MINUTES: i64 = 10;
const PROJECT_CONCURRENCY: usize = 8;
const P99_RANGE_MINUTES: i64 = 7 * 24 * 60;
const P99_TTL_SECONDS: u64 = 24 * 60 * 60;

struct MetricAlert {
    row: MetricAlertRow,
    rule: Rule,
    fingerprint: String,
    interval_minutes: i64,
}

#[derive(Serialize, Deserialize)]
struct CachedP99 {
    value: Option<f64>,
}

struct Tick<'a> {
    pool: &'a PgPool,
    clickhouse: &'a clickhouse::Client,
    queue: &'a Arc<MessageQueue>,
    cache: &'a Cache,
    ingestion_behind: bool,
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

async fn run_tick(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    queue: &Arc<MessageQueue>,
    cache: &Cache,
) -> anyhow::Result<()> {
    let target = Utc::now().timestamp().div_euclid(60) - METRIC_ALERTS_SETTLE_MINUTES.get();
    let last = cache
        .get::<i64>(METRIC_ALERTS_LAST_MINUTE_CACHE_KEY)
        .await
        .unwrap_or(None);
    let first = match last {
        Some(last) if target - last <= MAX_CATCH_UP_MINUTES => last + 1,
        _ => target,
    };

    let alerts = load_alerts(pool).await?;
    let tick = Tick {
        pool,
        clickhouse,
        queue,
        cache,
        ingestion_behind: !alerts.is_empty() && ingestion::is_behind(cache).await,
    };

    for minute in first..=target {
        let mut due: HashMap<Uuid, Vec<&MetricAlert>> = HashMap::new();
        for alert in &alerts {
            if is_due(&alert.row.id, alert.interval_minutes, minute) {
                due.entry(alert.row.project_id).or_default().push(alert);
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

    Ok(())
}

async fn check_project(tick: &Tick<'_>, project_id: Uuid, alerts: Vec<&MetricAlert>, minute: i64) {
    let checks: Vec<RuleChecks> = alerts
        .iter()
        .map(|alert| RuleChecks {
            rule: &alert.rule,
            ranges: ranges_of(&alert.rule, minute),
        })
        .collect();
    let series = match fetch_series(tick.clickhouse, &project_id, &checks).await {
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

    for (alert, series) in alerts.iter().zip(&series) {
        if let Err(e) = check_alert(tick, alert, series, minute).await {
            log::error!(
                "[Metric alerts] Failed to check rule {}: {:?}",
                alert.row.id,
                e
            );
        }
    }
}

/// The p99 trace cost a `trace_p99` rule compares against, refreshed daily.
async fn trace_cost_p99(
    tick: &Tick<'_>,
    alert: &MetricAlert,
    minute: i64,
) -> anyhow::Result<Option<f64>> {
    if alert.rule.condition != Condition::TraceP99 {
        return Ok(None);
    }
    let key = format!(
        "{METRIC_ALERT_TRACE_COST_P99_CACHE_KEY}:{}:{}:{}",
        alert.row.project_id, alert.row.id, alert.fingerprint
    );
    if let Ok(Some(cached)) = tick.cache.get::<CachedP99>(&key).await {
        return Ok(cached.value);
    }

    let range = Minutes {
        start: minute - P99_RANGE_MINUTES,
        end: minute,
    };
    let value =
        get_trace_cost_p99(tick.clickhouse, &alert.row.project_id, &alert.rule, range).await?;
    if let Err(e) = tick
        .cache
        .insert_with_ttl(&key, CachedP99 { value }, P99_TTL_SECONDS)
        .await
    {
        log::warn!("[Metric alerts] Failed to cache p99 trace cost: {:?}", e);
    }

    Ok(value)
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
    let context = Context {
        trace_cost_p99: trace_cost_p99(tick, alert, minute).await?,
        ingestion_behind: tick.ingestion_behind,
    };

    for group in groups(&alert.rule, series, minute, &states) {
        let mut state = states.remove(&group).unwrap_or_default();
        let before = state.clone();
        let model = alert.rule.group_by.map(|_| group.as_str());
        let observation = observe(&alert.rule, series, model, minute, context);
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
