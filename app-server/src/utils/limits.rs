use std::sync::Arc;

use anyhow::Result;
use tracing::instrument;
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{
            PROJECT_CACHE_KEY, USAGE_WARNING_SENT_CACHE_KEY, WORKSPACE_BYTES_USAGE_CACHE_KEY,
            WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY, WORKSPACE_USAGE_WARNINGS_CACHE_KEY,
        },
    },
    ch::limits::{
        get_workspace_bytes_ingested_by_project_ids, get_workspace_signal_runs_by_project_ids,
    },
    db::{self, DB, projects::ProjectWithWorkspaceBillingInfo, usage_warnings},
    mq::MessageQueue,
    notifications::{self, EmailPayload, NotificationMessage, NotificationType},
    reports::email_template::html_escape,
};
// For workspaces over the limit, expire the cache after 24 hours,
// so that it resets in the next billing period (+/- 1 day).
const WORKSPACE_USAGE_TTL_SECONDS: u64 = 60 * 60 * 24; // 24 hours

/// TTL for the idempotency key preventing duplicate soft-limit notifications.
/// Must be >= WORKSPACE_USAGE_TTL_SECONDS so that cache repopulation doesn't
/// re-trigger notifications for thresholds already exceeded.
const USAGE_WARNING_IDEMPOTENCY_TTL_SECONDS: u64 = 60 * 60 * 25; // 25 hours

/// TTL for cached usage warnings per workspace. Keeps them fresh while
/// avoiding a DB query on every ingestion batch.
const USAGE_WARNINGS_CACHE_TTL_SECONDS: u64 = 5 * 60; // 5 minutes

const USAGE_WARNING_FROM_EMAIL: &str = "Laminar <usage@mail.lmnr.ai>";

/// Returns the effective bytes hard limit for a workspace, or None if no limit should be enforced.
///
/// - For free tier: always uses the tier limit (custom limits are not allowed).
/// - For paid tiers: uses custom limit when set, else no limit is enforced.
fn get_effective_bytes_limit(project_info: &ProjectWithWorkspaceBillingInfo) -> Option<i64> {
    if project_info.tier_name.trim().to_lowercase() == "free" {
        return Some(project_info.bytes_limit);
    }
    project_info.custom_bytes_limit
}

/// Returns the effective signal runs hard limit for a workspace, or None if no limit should be enforced.
fn get_effective_signal_runs_limit(project_info: &ProjectWithWorkspaceBillingInfo) -> Option<i64> {
    if project_info.tier_name.trim().to_lowercase() == "free" {
        return Some(project_info.signal_runs_limit);
    }
    project_info.custom_signal_runs_limit
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

#[instrument(skip(db, clickhouse, cache, queue, project_id, bytes))]
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
    let is_free = project_info.tier_name.trim().to_lowercase() == "free";
    let has_hard_limit = get_effective_bytes_limit(&project_info).is_some();

    // We need usage tracking if there is a hard limit, or if this is a paid workspace
    // (paid workspaces may have soft limits even without hard limits).
    if !has_hard_limit && is_free {
        return Ok(());
    }

    let cache_key = format!("{WORKSPACE_BYTES_USAGE_CACHE_KEY}:{workspace_id}");

    let new_value = match cache.get::<i64>(&cache_key).await {
        Ok(Some(_)) => {
            // Cache exists - atomically increment it
            match cache.increment(&cache_key, bytes as i64).await {
                Ok(new_val) => Some(new_val),
                Err(e) => {
                    log::error!(
                        "Failed to increment workspace bytes ingested cache for project [{}]: {:?}",
                        project_id,
                        e
                    );
                    None
                }
            }
        }
        Ok(None) | Err(_) => {
            // Cache miss - recompute from ClickHouse and populate the cache
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
            cache
                .insert_with_ttl::<i64>(&cache_key, bytes_ingested, WORKSPACE_USAGE_TTL_SECONDS)
                .await?;
            // On cache miss we can't detect boundary crossing atomically,
            // but we still check if usage already exceeds any warning thresholds.
            // The idempotency key in send_soft_limit_notification prevents duplicates.
            check_exceeded_soft_limits(
                db.clone(),
                cache.clone(),
                queue.clone(),
                workspace_id,
                "bytes",
                bytes_ingested,
            )
            .await;
            None
        }
    };

    // Check soft limits if we got an atomic new_value from increment
    if let Some(new_bytes) = new_value {
        let previous_bytes = new_bytes - bytes as i64;
        check_soft_limits(
            db.clone(),
            cache.clone(),
            queue,
            workspace_id,
            "bytes",
            new_bytes,
            previous_bytes,
        )
        .await;
    }

    Ok(())
}

#[instrument(skip(db, clickhouse, cache, queue, project_id, runs))]
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
    let is_free = project_info.tier_name.trim().to_lowercase() == "free";
    let has_hard_limit = get_effective_signal_runs_limit(&project_info).is_some();

    if !has_hard_limit && is_free {
        return Ok(());
    }

    let cache_key = format!("{WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY}:{workspace_id}");

    let new_value = match cache.get::<i64>(&cache_key).await {
        Ok(Some(_)) => {
            match cache.increment(&cache_key, runs as i64).await {
                Ok(new_val) => Some(new_val),
                Err(e) => {
                    log::error!(
                        "Failed to increment workspace signal runs cache for project [{}]: {:?}",
                        project_id,
                        e
                    );
                    None
                }
            }
        }
        Ok(None) | Err(_) => {
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
            cache
                .insert_with_ttl::<i64>(&cache_key, signal_runs, WORKSPACE_USAGE_TTL_SECONDS)
                .await?;
            check_exceeded_soft_limits(
                db.clone(),
                cache.clone(),
                queue.clone(),
                workspace_id,
                "signal_runs",
                signal_runs,
            )
            .await;
            None
        }
    };

    // Check soft limits if we got an atomic new_value from increment
    if let Some(new_runs) = new_value {
        let previous_runs = new_runs - runs as i64;
        check_soft_limits(
            db.clone(),
            cache.clone(),
            queue,
            workspace_id,
            "signal_runs",
            new_runs,
            previous_runs,
        )
        .await;
    }

    Ok(())
}

/// Check if any soft limits (usage warnings) were crossed by this increment and send notifications.
async fn check_soft_limits(
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    workspace_id: Uuid,
    usage_item: &str,
    new_value: i64,
    previous_value: i64,
) {
    let warnings = match get_cached_usage_warnings(db.clone(), cache.clone(), workspace_id).await {
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

    for warning in warnings.iter().filter(|w| w.usage_item == usage_item) {
        let limit = warning.limit_value;
        // Only fire notification if we crossed the boundary on this specific increment.
        // Because cache.increment is atomic, we know that we are the one who crossed it.
        if new_value >= limit && previous_value < limit {
            send_soft_limit_notification(
                db.clone(),
                cache.clone(),
                queue.clone(),
                workspace_id,
                warning.id,
                usage_item,
                limit,
            )
            .await;
        }
    }
}

/// On cache repopulation, check if usage already exceeds any warning thresholds.
/// This catches the case where a threshold was crossed while the cache was expired.
/// Relies on the idempotency key in send_soft_limit_notification to prevent duplicates.
async fn check_exceeded_soft_limits(
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    workspace_id: Uuid,
    usage_item: &str,
    current_value: i64,
) {
    let warnings = match get_cached_usage_warnings(db.clone(), cache.clone(), workspace_id).await {
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

    for warning in warnings.iter().filter(|w| w.usage_item == usage_item) {
        if current_value >= warning.limit_value {
            send_soft_limit_notification(
                db.clone(),
                cache.clone(),
                queue.clone(),
                workspace_id,
                warning.id,
                usage_item,
                warning.limit_value,
            )
            .await;
        }
    }
}

/// Send a soft limit notification to workspace owners via the notifications queue.
async fn send_soft_limit_notification(
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    workspace_id: Uuid,
    warning_id: Uuid,
    usage_item: &str,
    limit_value: i64,
) {
    // Idempotency: use a cache key to prevent duplicate notifications for the same warning
    let idempotency_key = format!(
        "{USAGE_WARNING_SENT_CACHE_KEY}:{}:{}",
        workspace_id, warning_id
    );

    // Check if we already sent this notification recently
    match cache.exists(&idempotency_key).await {
        Ok(true) => {
            log::debug!(
                "Soft limit notification already sent for workspace [{}] warning [{}]",
                workspace_id,
                warning_id
            );
            return;
        }
        Ok(false) => {}
        Err(e) => {
            log::warn!(
                "Failed to check idempotency for soft limit notification: {:?}",
                e
            );
            // Continue anyway – better to send a duplicate than miss a notification
        }
    }

    // Mark as sent before sending to prevent race conditions
    if let Err(e) = cache
        .insert_with_ttl::<i64>(
            &idempotency_key,
            1,
            USAGE_WARNING_IDEMPOTENCY_TTL_SECONDS,
        )
        .await
    {
        log::warn!(
            "Failed to set idempotency key for soft limit notification: {:?}",
            e
        );
    }

    // Get workspace owner emails
    let owner_emails =
        match usage_warnings::get_workspace_owner_emails(&db.pool, workspace_id).await {
            Ok(emails) => emails,
            Err(e) => {
                log::error!(
                    "Failed to get owner emails for workspace [{}]: {:?}",
                    workspace_id,
                    e
                );
                return;
            }
        };

    if owner_emails.is_empty() {
        log::warn!(
            "No owner emails found for workspace [{}], skipping soft limit notification",
            workspace_id
        );
        return;
    }

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
    let subject = format!(
        "Usage warning: {} reached {} \u{2013} {}",
        usage_label, formatted_limit, workspace_name
    );
    let html = render_usage_warning_email(
        &workspace_name,
        workspace_id,
        usage_item,
        &formatted_limit,
        &usage_label,
    );

    let email_payload = EmailPayload {
        from: USAGE_WARNING_FROM_EMAIL.to_string(),
        to: owner_emails,
        subject,
        html,
        inline_logo: true,
    };

    let notification_message = NotificationMessage {
        project_id: Uuid::nil(),
        trace_id: Uuid::nil(),
        notification_type: NotificationType::Email,
        event_name: format!("usage_warning_{}", usage_item),
        payload: match serde_json::to_value(&email_payload) {
            Ok(v) => v,
            Err(e) => {
                log::error!("Failed to serialize email payload: {:?}", e);
                return;
            }
        },
        workspace_id,
        definition_type: "USAGE_WARNING".to_string(),
        definition_id: warning_id,
        target_id: Uuid::nil(),
        target_type: "EMAIL".to_string(),
    };

    if let Err(e) = notifications::push_to_notification_queue(notification_message, queue).await {
        log::error!(
            "Failed to push soft limit notification for workspace [{}]: {:?}",
            workspace_id,
            e
        );
    } else {
        log::info!(
            "Pushed soft limit notification for workspace [{}], item={}, limit={}",
            workspace_id,
            usage_item,
            limit_value
        );
    }
}

fn format_usage_item(usage_item: &str, limit_value: i64) -> (String, String) {
    match usage_item {
        "bytes" => {
            let gb = limit_value as f64 / (1024.0 * 1024.0 * 1024.0);
            let formatted = if gb >= 1.0 {
                format!("{:.2} GB", gb)
            } else {
                format!("{:.2} MB", gb * 1024.0)
            };
            ("Data ingestion".to_string(), formatted)
        }
        "signal_runs" => {
            let formatted = format_number_with_commas(limit_value);
            ("Signal runs".to_string(), formatted)
        }
        _ => (usage_item.to_string(), limit_value.to_string()),
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

fn render_usage_warning_email(
    workspace_name: &str,
    workspace_id: Uuid,
    usage_item: &str,
    formatted_limit: &str,
    usage_label: &str,
) -> String {
    let meter_description = match usage_item {
        "bytes" => "data ingested",
        "signal_runs" => "signal runs used",
        _ => "usage",
    };

    format!(
        r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Usage Warning – {workspace_name}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:#0A0A0A;border-radius:10px;padding:28px 24px;margin-bottom:20px;">
    <img src="cid:laminar-logo" alt="Laminar" width="120" height="21" style="display:block;margin-bottom:16px;" />
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">Usage Warning</h1>
    <p style="margin:0;font-size:16px;color:#D0754E;">{usage_label} threshold reached</p>
  </div>

  <!-- Content -->
  <div style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;padding:24px;margin-bottom:20px;">
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
      Your workspace <strong>{workspace_name}</strong> has reached <strong>{formatted_limit}</strong> of {meter_description} in the current billing cycle.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
      This is a warning notification you configured. No action is required unless you want to adjust your usage or limits.
    </p>
    <div style="text-align:center;padding-top:8px;">
      <a href="https://lmnr.ai/workspace/{workspace_id}?tab=usage" style="display:inline-block;background:#D0754E;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:600;">View Usage</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:16px 0;">
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">This notification was generated automatically by <a href="https://www.lmnr.ai" style="color:#D0754E;text-decoration:none;">Laminar</a>.</p>
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">You are receiving this because you are the owner of the {workspace_name} workspace.</p>
    <p style="margin:0;font-size:12px;color:#9ca3af;"><a href="https://lmnr.ai/workspace/{workspace_id}?tab=usage" style="color:#D0754E;text-decoration:none;">Manage warning thresholds</a></p>
  </div>

</div>
</body>
</html>"##,
        workspace_name = html_escape(workspace_name),
        workspace_id = workspace_id,
        usage_label = html_escape(usage_label),
        formatted_limit = html_escape(formatted_limit),
        meter_description = meter_description,
    )
}

/// Fetch usage warnings for a workspace, using a short-lived cache to avoid
/// hitting the database on every ingestion batch.
async fn get_cached_usage_warnings(
    db: Arc<DB>,
    cache: Arc<Cache>,
    workspace_id: Uuid,
) -> Result<Vec<usage_warnings::UsageWarning>> {
    let cache_key = format!("{WORKSPACE_USAGE_WARNINGS_CACHE_KEY}:{workspace_id}");

    if let Ok(Some(cached)) = cache
        .get::<Vec<usage_warnings::UsageWarning>>(&cache_key)
        .await
    {
        return Ok(cached);
    }

    let warnings =
        usage_warnings::get_usage_warnings_for_workspace(&db.pool, workspace_id).await?;

    if let Err(e) = cache
        .insert_with_ttl(&cache_key, warnings.clone(), USAGE_WARNINGS_CACHE_TTL_SECONDS)
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
