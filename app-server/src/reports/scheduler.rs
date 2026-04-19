use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Datelike, Timelike, Utc};
use sqlx::PgPool;
use tokio::time::{self, MissedTickBehavior};

use crate::cache::keys::{REPORT_SCHEDULER_LAST_CHECK_CACHE_KEY, REPORT_SCHEDULER_LOCK_CACHE_KEY};
use crate::cache::{Cache, CacheTrait};
use crate::db::reports::get_reports_for_weekday_and_hour;
use crate::mq::MessageQueue;

use super::{ReportTriggerMessage, push_to_reports_queue};

// Safety net TTL in case the holder crashes; normal operation releases the lock each cycle.
const LOCK_TTL_SECONDS: u64 = 900;
const TICK_INTERVAL_SECONDS: u64 = 600;

pub async fn run_reports_scheduler(pool: PgPool, queue: Arc<MessageQueue>, cache: Arc<Cache>) {
    log::debug!("[Reports Scheduler] Starting reports scheduler");
    let mut interval = time::interval(Duration::from_secs(TICK_INTERVAL_SECONDS));
    interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        interval.tick().await;

        match cache
            .try_acquire_lock(REPORT_SCHEDULER_LOCK_CACHE_KEY, LOCK_TTL_SECONDS)
            .await
        {
            Ok(true) => {
                log::debug!("[Reports Scheduler] Acquired lock, checking and enqueuing reports");
                if let Err(e) = check_and_enqueue(&pool, queue.clone(), &cache).await {
                    log::error!("[Reports Scheduler] Error: {:?}", e);
                }

                if let Err(e) = cache.release_lock(REPORT_SCHEDULER_LOCK_CACHE_KEY).await {
                    log::warn!("[Reports Scheduler] Failed to release lock: {:?}", e);
                }
            }
            Ok(false) => {
                log::debug!("[Reports Scheduler] Another replica holds the lock, skipping");
            }
            Err(e) => {
                log::warn!("[Reports Scheduler] Failed to acquire lock: {:?}", e);
            }
        }
    }
}

fn truncate_to_hour(dt: DateTime<Utc>) -> DateTime<Utc> {
    dt.with_minute(0)
        .and_then(|t| t.with_second(0))
        .and_then(|t| t.with_nanosecond(0))
        .unwrap_or(dt)
}

fn hour_boundaries_between(from: DateTime<Utc>, to: DateTime<Utc>) -> Vec<(i32, i32, i64)> {
    let start = truncate_to_hour(from) + chrono::Duration::hours(1);
    let end = truncate_to_hour(to);

    if start > end {
        return vec![];
    }

    let mut result = vec![];
    let mut t = start;
    while t <= end {
        let weekday = t.weekday().num_days_from_monday() as i32;
        let hour = t.hour() as i32;
        result.push((weekday, hour, t.timestamp()));
        t += chrono::Duration::hours(1);
    }
    result
}

async fn check_and_enqueue(
    pool: &PgPool,
    queue: Arc<MessageQueue>,
    cache: &Arc<Cache>,
) -> anyhow::Result<()> {
    let now = Utc::now();

    let last_check_ts: Option<i64> = cache
        .get(REPORT_SCHEDULER_LAST_CHECK_CACHE_KEY)
        .await
        .unwrap_or(None);

    let last_check = last_check_ts
        .and_then(|ts| DateTime::from_timestamp(ts, 0))
        .unwrap_or(now);

    log::info!(
        "[Reports Scheduler] Checking since last check: {} - {}",
        last_check,
        now
    );

    let hours_to_check = hour_boundaries_between(last_check, now);
    if hours_to_check.is_empty() {
        // No hour boundaries to process; advance checkpoint so the same
        // sub-hour window is not re-scanned on the next tick.
        cache
            .insert(REPORT_SCHEDULER_LAST_CHECK_CACHE_KEY, now.timestamp())
            .await?;
        return Ok(());
    }
    log::info!(
        "[Reports Scheduler] Checking {} hour(s): {:?}",
        hours_to_check.len(),
        hours_to_check
    );

    for (weekday, hour, triggered_at) in hours_to_check {
        let reports = get_reports_for_weekday_and_hour(pool, weekday, hour).await?;

        let mut all_enqueued = true;
        for report in reports {
            let message = ReportTriggerMessage {
                id: report.id,
                workspace_id: report.workspace_id,
                r#type: report.r#type,
                weekdays: report.weekdays,
                hour: report.hour,
                triggered_at,
            };

            if let Err(e) = push_to_reports_queue(message, queue.clone()).await {
                log::error!(
                    "[Reports Scheduler] Failed to enqueue report {}: {:?}",
                    report.id,
                    e
                );
                all_enqueued = false;
            }
        }

        if !all_enqueued {
            // Stop advancing the checkpoint so this hour bucket (and any
            // remaining ones) will be retried on the next tick.
            return Err(anyhow::anyhow!(
                "One or more reports failed to enqueue for hour {triggered_at}; checkpoint held for retry"
            ));
        }

        // Advance checkpoint only after all reports in this hour bucket
        // have been successfully enqueued.
        cache
            .insert(REPORT_SCHEDULER_LAST_CHECK_CACHE_KEY, triggered_at)
            .await?;
    }

    Ok(())
}
