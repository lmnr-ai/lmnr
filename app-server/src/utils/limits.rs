use std::sync::Arc;

use anyhow::Result;
use chrono::{DateTime, Months, Utc};
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{
            PROJECT_CACHE_KEY, WORKSPACE_BYTES_USAGE_CACHE_KEY,
            WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY, WORKSPACE_USAGE_WARNINGS_CACHE_KEY,
        },
    },
    ch::limits::{
        complete_months_elapsed, get_workspace_bytes_ingested_by_project_ids,
        get_workspace_signal_runs_by_project_ids,
    },
    db::{
        self, DB,
        projects::ProjectWithWorkspaceBillingInfo,
        usage_warnings::{self, UsageItem},
    },
    mq::MessageQueue,
    notifications::{self, NotificationDefinitionType, NotificationKind, NotificationMessage},
};
// For workspaces over the limit, expire the cache after 24 hours,
// so that it resets in the next billing period (+/- 1 day).
const WORKSPACE_USAGE_TTL_SECONDS: u64 = 60 * 60 * 24; // 24 hours

/// TTL for cached usage warnings per workspace. The cache is explicitly cleared
/// by the frontend whenever warnings are added or removed, so a long TTL is fine.
const USAGE_WARNINGS_CACHE_TTL_SECONDS: u64 = 60 * 60 * 24 * 7; // 7 days

/// Returns the effective bytes hard limit for a workspace, or None if no limit should be enforced.
///
/// - For free tier: always uses the tier limit (custom limits are not allowed).
/// - For paid tiers: uses custom limit when set, else no limit is enforced.
fn get_effective_bytes_limit(project_info: &ProjectWithWorkspaceBillingInfo) -> Option<i64> {
    if project_info.tier_name.is_free() {
        return Some(project_info.bytes_limit);
    }
    project_info.custom_bytes_limit
}

/// Returns the effective signal runs hard limit for a workspace, or None if no limit should be enforced.
fn get_effective_signal_runs_limit(project_info: &ProjectWithWorkspaceBillingInfo) -> Option<i64> {
    if project_info.tier_name.is_free() {
        return Some(project_info.signal_runs_limit);
    }
    project_info.custom_signal_runs_limit
}

/// Compute the start of the current billing period from workspace reset_time.
fn current_billing_period_start(reset_time: DateTime<Utc>) -> DateTime<Utc> {
    let now = Utc::now();
    let months_elapsed = complete_months_elapsed(reset_time, now);
    if months_elapsed > 0 {
        reset_time
            .checked_add_months(Months::new(months_elapsed))
            .unwrap_or(reset_time)
    } else {
        reset_time
    }
}

pub async fn get_workspace_bytes_limit_exceeded(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<bool> {
    let project_info =
        get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id).await?;

    let effective_limit = match get_effective_bytes_limit(&project_info) {
        Some(limit) => limit,
        None => return Ok(false),
    };

    let workspace_id = project_info.workspace_id;
    let cache_key = format!("{WORKSPACE_BYTES_USAGE_CACHE_KEY}:{workspace_id}");

    let bytes_ingested = match cache.get::<i64>(&cache_key).await {
        Ok(Some(bytes)) => bytes,
        Ok(None) | Err(_) => {
            let bytes = match get_workspace_bytes_ingested_by_project_ids(
                clickhouse,
                project_info.workspace_project_ids,
                project_info.reset_time,
            )
            .await
            {
                Ok(bytes) => bytes as i64,
                Err(e) => {
                    log::error!(
                        "Failed to get workspace bytes ingested for project [{}]: {:?}",
                        project_id,
                        e
                    );
                    0
                }
            };
            if let Err(e) = cache
                .insert_with_ttl::<i64>(&cache_key, bytes, WORKSPACE_USAGE_TTL_SECONDS)
                .await
            {
                log::error!(
                    "Failed to insert workspace bytes ingested cache for project [{}]: {:?}",
                    project_id,
                    e
                );
            };

            bytes
        }
    };

    Ok(bytes_ingested >= effective_limit)
}

pub async fn get_workspace_signal_runs_limit_exceeded(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<bool> {
    let project_info =
        get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id).await?;

    let effective_limit = match get_effective_signal_runs_limit(&project_info) {
        Some(limit) => limit,
        None => return Ok(false),
    };

    let workspace_id = project_info.workspace_id;
    let cache_key = format!("{WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY}:{workspace_id}");

    let signal_runs = match cache.get::<i64>(&cache_key).await {
        Ok(Some(runs)) => runs,
        Ok(None) | Err(_) => {
            let runs = match get_workspace_signal_runs_by_project_ids(
                clickhouse,
                project_info.workspace_project_ids,
                project_info.reset_time,
            )
            .await
            {
                Ok(runs) => runs as i64,
                Err(e) => {
                    log::error!(
                        "Failed to get workspace signal runs for project [{}]: {:?}",
                        project_id,
                        e
                    );
                    0
                }
            };
            if let Err(e) = cache
                .insert_with_ttl::<i64>(&cache_key, runs, WORKSPACE_USAGE_TTL_SECONDS)
                .await
            {
                log::error!(
                    "Failed to insert workspace signal runs cache for project [{}]: {:?}",
                    project_id,
                    e
                );
            };
            runs
        }
    };

    log::debug!(
        "Workspace signal runs check: {}/{}",
        signal_runs,
        effective_limit
    );

    Ok(signal_runs >= effective_limit)
}

pub async fn update_workspace_bytes_ingested(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    project_id: Uuid,
    bytes: usize,
) -> Result<()> {
    let project_info =
        match get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id).await {
            Ok(info) => info,
            Err(e) => {
                log::error!(
                    "Failed to get workspace info for project [{}]: {:?}",
                    project_id,
                    e
                );
                return Err(anyhow::anyhow!(
                    "Failed to get workspace info for project [{}]: {:?}",
                    project_id,
                    e
                ));
            }
        };

    let workspace_id = project_info.workspace_id;

    let cache_key = format!("{WORKSPACE_BYTES_USAGE_CACHE_KEY}:{workspace_id}");

    let current_value = match cache.get::<i64>(&cache_key).await {
        Ok(Some(_)) => {
            // Cache exists - atomically increment it
            match cache.increment(&cache_key, bytes as i64).await {
                Ok(new_val) => new_val,
                Err(e) => {
                    log::error!(
                        "Failed to increment workspace bytes ingested cache for project [{}]: {:?}",
                        project_id,
                        e
                    );
                    return Ok(());
                }
            }
        }
        Ok(None) | Err(_) => {
            // Cache miss - recompute from ClickHouse and seed the cache.
            // We add the current batch size to the ClickHouse value so the cache
            // reflects the true total (ClickHouse may not have replicated this batch yet).
            let bytes_ingested = match get_workspace_bytes_ingested_by_project_ids(
                clickhouse,
                project_info.workspace_project_ids,
                project_info.reset_time,
            )
            .await
            {
                Ok(b) => b as i64,
                Err(e) => {
                    log::error!(
                        "Failed to get workspace bytes ingested for project [{}]: {:?}",
                        project_id,
                        e
                    );
                    0
                }
            };
            // We do not add the current value, because Clickhouse likely has already ingested
            // the current payload. Even if it didn't, it's safer to underestimate, so that:
            // - for soft limits, the limit is less likely to be silently skipped
            // - for hard limits, the limit is not hit prematurely
            cache
                .insert_with_ttl::<i64>(&cache_key, bytes_ingested, WORKSPACE_USAGE_TTL_SECONDS)
                .await?;

            bytes_ingested
        }
    };

    check_soft_limits(
        db.clone(),
        cache.clone(),
        queue,
        workspace_id,
        project_info.reset_time,
        UsageItem::Bytes,
        current_value,
    )
    .await;

    Ok(())
}

pub async fn update_workspace_signal_runs_used(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    project_id: Uuid,
    runs: usize,
) -> Result<()> {
    let project_info =
        match get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id).await {
            Ok(info) => info,
            Err(e) => {
                log::error!(
                    "Failed to get workspace info for project [{}]: {:?}",
                    project_id,
                    e
                );
                return Err(anyhow::anyhow!(
                    "Failed to get workspace info for project [{}]: {:?}",
                    project_id,
                    e
                ));
            }
        };

    let workspace_id = project_info.workspace_id;

    let cache_key = format!("{WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY}:{workspace_id}");

    let current_value = match cache.get::<i64>(&cache_key).await {
        Ok(Some(_)) => match cache.increment(&cache_key, runs as i64).await {
            Ok(new_val) => new_val,
            Err(e) => {
                log::error!(
                    "Failed to increment workspace signal runs cache for project [{}]: {:?}",
                    project_id,
                    e
                );
                return Ok(());
            }
        },
        Ok(None) | Err(_) => {
            // Cache miss - recompute from ClickHouse and seed the cache.
            // We add the current batch size to the ClickHouse value so the cache
            // reflects the true total (ClickHouse may not have replicated this batch yet).
            let signal_runs = match get_workspace_signal_runs_by_project_ids(
                clickhouse,
                project_info.workspace_project_ids,
                project_info.reset_time,
            )
            .await
            {
                Ok(r) => r as i64,
                Err(e) => {
                    log::error!(
                        "Failed to get workspace signal runs for project [{}]: {:?}",
                        project_id,
                        e
                    );
                    0
                }
            };
            // We do not add the current value, because Clickhouse likely has already ingested
            // the current payload. Even if it didn't, it's safer to underestimate, so that:
            // - for soft limits, the limit is less likely to be silently skipped
            // - for hard limits, the limit is not hit prematurely
            cache
                .insert_with_ttl::<i64>(&cache_key, signal_runs, WORKSPACE_USAGE_TTL_SECONDS)
                .await?;
            signal_runs
        }
    };

    check_soft_limits(
        db.clone(),
        cache.clone(),
        queue,
        workspace_id,
        project_info.reset_time,
        UsageItem::SignalRuns,
        current_value,
    )
    .await;

    Ok(())
}

/// Check soft limits (usage warnings) against the current usage value and enqueue
/// notifications for any warnings that have not yet been sent this billing cycle.
async fn check_soft_limits(
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    workspace_id: Uuid,
    reset_time: DateTime<Utc>,
    usage_item: UsageItem,
    current_value: i64,
) {
    let warnings = match get_usage_warnings(db.clone(), cache.clone(), workspace_id).await {
        Ok(w) => w,
        Err(e) => {
            log::warn!(
                "Failed to fetch usage warnings for workspace [{}]: {:?}",
                workspace_id,
                e
            );
            return;
        }
    };

    let billing_start = current_billing_period_start(reset_time);

    for warning in warnings.iter().filter(|w| w.usage_item == usage_item) {
        if current_value < warning.limit_value {
            continue;
        }

        if warning.last_notified_at.is_some_and(|t| t >= billing_start) {
            // already notified this billing cycle
            continue;
        }

        send_soft_limit_notification(
            db.clone(),
            cache.clone(),
            queue.clone(),
            workspace_id,
            warning.id,
            &usage_item,
            warning.limit_value,
        )
        .await;
    }
}

/// Build and enqueue a soft-limit notification for workspace owners.
/// Only sends the core usage warning data. Target fetching, email rendering, and
/// deduplication all happen downstream in the notification consumer pipeline.
async fn send_soft_limit_notification(
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    workspace_id: Uuid,
    warning_id: Uuid,
    usage_item: &UsageItem,
    limit_value: i64,
) {
    let workspace_name = match usage_warnings::get_workspace_name(&db.pool, workspace_id).await {
        Ok(name) => name,
        Err(e) => {
            log::warn!(
                "Failed to get workspace name for [{}]: {:?}",
                workspace_id,
                e
            );
            "Your workspace".to_string()
        }
    };

    let (usage_label, formatted_limit) = format_usage_item(usage_item, limit_value);

    let usage_item_str = match usage_item {
        UsageItem::Bytes => "bytes",
        UsageItem::SignalRuns => "signal_runs",
    };

    let notification_message = NotificationMessage {
        project_id: Uuid::nil(),
        workspace_id,
        definition_type: NotificationDefinitionType::UsageWarning,
        definition_id: warning_id,
        notification_kind: NotificationKind::UsageWarning {
            workspace_name,
            usage_label,
            formatted_limit,
            usage_item: usage_item_str.to_string(),
        },
    };

    match notifications::push_to_notification_queue(notification_message, queue).await {
        Err(e) => {
            log::error!(
                "Failed to push soft limit notification for workspace [{}] warning [{}]: {:?}",
                workspace_id,
                warning_id,
                e
            );
        }
        Ok(()) => {
            log::info!(
                "Pushed soft limit notification for workspace [{}], item={}, limit={}",
                workspace_id,
                usage_item,
                limit_value
            );
            // Message is now durably queued. Eagerly update DB and evict the warnings
            // cache so ingestion workers don't re-enqueue for the same billing cycle.
            if let Err(e) = usage_warnings::mark_warning_as_notified(&db.pool, warning_id).await {
                log::error!(
                    "Failed to update last_notified_at for warning [{}]: {:?}",
                    warning_id,
                    e
                );
            }
            let cache_key = format!("{WORKSPACE_USAGE_WARNINGS_CACHE_KEY}:{workspace_id}");
            if let Err(e) = cache.remove(&cache_key).await {
                log::warn!(
                    "Failed to evict warnings cache for workspace [{}]: {:?}",
                    workspace_id,
                    e
                );
            }
        }
    }
}

fn format_usage_item(usage_item: &UsageItem, limit_value: i64) -> (String, String) {
    match usage_item {
        UsageItem::Bytes => {
            let gb = limit_value as f64 / (1024.0 * 1024.0 * 1024.0);
            let formatted = if gb >= 1.0 {
                format!("{:.2} GB", gb)
            } else {
                format!("{:.2} MB", gb * 1024.0)
            };
            ("Data ingestion".to_string(), formatted)
        }
        UsageItem::SignalRuns => {
            let formatted = format_number_with_commas(limit_value);
            ("Signal runs".to_string(), formatted)
        }
    }
}

/// Format an integer with comma-separated thousands (e.g. 1000 -> "1,000").
/// Handles negative numbers correctly (e.g. -1000 -> "-1,000").
fn format_number_with_commas(n: i64) -> String {
    let is_negative = n < 0;
    let abs_str = n.unsigned_abs().to_string();
    let digits = abs_str.as_bytes();

    let mut result = String::with_capacity(abs_str.len() + abs_str.len() / 3 + 1);
    if is_negative {
        result.push('-');
    }

    for (i, &b) in digits.iter().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            result.push(',');
        }
        result.push(b as char);
    }

    result
}

/// Fetch usage warnings for a workspace, using a short-lived cache to avoid
/// hitting the database on every ingestion batch.
async fn get_usage_warnings(
    db: Arc<DB>,
    cache: Arc<Cache>,
    workspace_id: Uuid,
) -> Result<Vec<usage_warnings::UsageWarning>> {
    let cache_key = format!("{WORKSPACE_USAGE_WARNINGS_CACHE_KEY}:{workspace_id}");

    match cache
        .get::<Vec<usage_warnings::UsageWarning>>(&cache_key)
        .await
    {
        Ok(Some(cached)) => Ok(cached),
        Ok(None) | Err(_) => {
            let warnings =
                usage_warnings::get_usage_warnings_for_workspace(&db.pool, workspace_id).await?;

            if let Err(e) = cache
                .insert_with_ttl(
                    &cache_key,
                    warnings.clone(),
                    USAGE_WARNINGS_CACHE_TTL_SECONDS,
                )
                .await
            {
                log::warn!(
                    "Failed to cache usage warnings for workspace [{}]: {:?}",
                    workspace_id,
                    e
                );
            }

            Ok(warnings)
        }
    }
}

async fn get_workspace_info_for_project_id(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<ProjectWithWorkspaceBillingInfo> {
    let cache_key = format!("{PROJECT_CACHE_KEY}:{project_id}");
    let cache_res = cache
        .get::<ProjectWithWorkspaceBillingInfo>(&cache_key)
        .await;
    match cache_res {
        Ok(Some(info)) => Ok(info),
        Ok(None) | Err(_) => {
            let info =
                db::projects::get_project_and_workspace_billing_info(&db.pool, &project_id).await?;
            cache
                .insert::<ProjectWithWorkspaceBillingInfo>(&cache_key, info.clone())
                .await?;
            Ok(info)
        }
    }
}
