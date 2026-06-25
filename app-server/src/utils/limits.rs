use std::sync::Arc;

use anyhow::Result;
use chrono::{DateTime, Months, Utc};
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{
            PROJECT_CACHE_KEY, WORKSPACE_BYTES_USAGE_CACHE_KEY,
            WORKSPACE_SIGNAL_CACHE_READ_TOKENS_USAGE_CACHE_KEY,
            WORKSPACE_SIGNAL_INPUT_TOKENS_USAGE_CACHE_KEY,
            WORKSPACE_SIGNAL_OUTPUT_TOKENS_USAGE_CACHE_KEY, WORKSPACE_USAGE_WARNINGS_CACHE_KEY,
        },
    },
    ch::limits::{
        WorkspaceSignalTokens, complete_months_elapsed,
        get_workspace_bytes_ingested_by_project_ids, get_workspace_signal_tokens_by_project_ids,
    },
    db::{
        self, DB,
        projects::{ProjectWithWorkspaceBillingInfo, WorkspaceTierName},
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

/// TTL for cached project + workspace billing info. The frontend explicitly
/// removes this key whenever the underlying data changes (tier switch, custom
/// limit edit, project create/delete), so the TTL is just a backstop against an
/// entry that was never invalidated.
const PROJECT_CACHE_TTL_SECONDS: u64 = 60 * 60 * 24 * 7; // 7 days

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

/// Returns the effective signal cost hard limit (micro-USD) for a workspace, or None if no limit should be enforced.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
fn get_effective_signal_cost_limit_micro_usd(
    project_info: &ProjectWithWorkspaceBillingInfo,
) -> Option<i64> {
    if project_info.tier_name.is_free() {
        return Some(project_info.signal_cost_included_micro_usd);
    }
    project_info.signal_cost_hard_limit_micro_usd
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
        match get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id).await? {
            Some(info) => info,
            None => {
                log::warn!(
                    "Project [{}] or its workspace no longer exists, skipping bytes limit check",
                    project_id,
                );
                return Ok(false);
            }
        };

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

#[cfg(feature = "signals")]
pub async fn get_workspace_signal_runs_limit_exceeded(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<bool> {
    let project_info = match get_workspace_info_for_project_id(
        db.clone(),
        cache.clone(),
        project_id,
    )
    .await?
    {
        Some(info) => info,
        None => {
            log::warn!(
                "Project [{}] or its workspace no longer exists, skipping signal runs limit check",
                project_id,
            );
            return Ok(false);
        }
    };

    let effective_limit = match get_effective_signal_cost_limit_micro_usd(&project_info) {
        Some(limit) => limit,
        None => return Ok(false),
    };

    let workspace_id = project_info.workspace_id;

    let (input_tokens, cache_read_tokens, output_tokens) = get_workspace_signal_tokens_cached(
        &clickhouse,
        cache.clone(),
        workspace_id,
        &project_info.workspace_project_ids,
        project_info.reset_time,
        project_id,
    )
    .await;

    // Tokens are stored raw; price into micro-USD here so the hard limit
    // compares against the same unit as `effective_limit` (also micro-USD).
    // Priced at the workspace's tier rate (Pro discounted) so the cost matches
    // what the workspace is actually billed.
    let signal_cost = crate::utils::signal_token_cost_micro_usd(
        input_tokens,
        cache_read_tokens,
        output_tokens,
        &project_info.tier_name,
    ) as i64;

    log::debug!(
        "Workspace signal cost check: {}/{} micro-USD",
        signal_cost,
        effective_limit
    );

    Ok(signal_cost >= effective_limit)
}

/// Read the workspace's accumulated signal `(input_tokens, cache_read_tokens,
/// output_tokens)` from the three token cache keys, reseeding all from
/// ClickHouse on a miss.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
async fn get_workspace_signal_tokens_cached(
    clickhouse: &clickhouse::Client,
    cache: Arc<Cache>,
    workspace_id: Uuid,
    workspace_project_ids: &[Uuid],
    reset_time: DateTime<Utc>,
    project_id: Uuid,
) -> (u64, u64, u64) {
    let input_key = format!("{WORKSPACE_SIGNAL_INPUT_TOKENS_USAGE_CACHE_KEY}:{workspace_id}");
    let cache_read_key =
        format!("{WORKSPACE_SIGNAL_CACHE_READ_TOKENS_USAGE_CACHE_KEY}:{workspace_id}");
    let output_key = format!("{WORKSPACE_SIGNAL_OUTPUT_TOKENS_USAGE_CACHE_KEY}:{workspace_id}");

    let cached_input = cache.get::<i64>(&input_key).await.ok().flatten();
    let cached_cache_read = cache.get::<i64>(&cache_read_key).await.ok().flatten();
    let cached_output = cache.get::<i64>(&output_key).await.ok().flatten();

    if let (Some(input), Some(cache_read), Some(output)) =
        (cached_input, cached_cache_read, cached_output)
    {
        return (
            input.max(0) as u64,
            cache_read.max(0) as u64,
            output.max(0) as u64,
        );
    }

    // Any key missing - recompute all from ClickHouse and seed them.
    let tokens = match get_workspace_signal_tokens_by_project_ids(
        clickhouse.clone(),
        workspace_project_ids.to_vec(),
        reset_time,
    )
    .await
    {
        Ok(tokens) => tokens,
        Err(e) => {
            log::error!(
                "Failed to get workspace signal tokens for project [{}]: {:?}",
                project_id,
                e
            );
            WorkspaceSignalTokens::default()
        }
    };
    let WorkspaceSignalTokens {
        input_tokens,
        cache_read_tokens,
        output_tokens,
    } = tokens;

    if let Err(e) = cache
        .insert_with_ttl::<i64>(&input_key, input_tokens as i64, WORKSPACE_USAGE_TTL_SECONDS)
        .await
    {
        log::error!(
            "Failed to insert workspace signal input tokens cache for project [{}]: {:?}",
            project_id,
            e
        );
    }
    if let Err(e) = cache
        .insert_with_ttl::<i64>(
            &cache_read_key,
            cache_read_tokens as i64,
            WORKSPACE_USAGE_TTL_SECONDS,
        )
        .await
    {
        log::error!(
            "Failed to insert workspace signal cache-read tokens cache for project [{}]: {:?}",
            project_id,
            e
        );
    }
    if let Err(e) = cache
        .insert_with_ttl::<i64>(
            &output_key,
            output_tokens as i64,
            WORKSPACE_USAGE_TTL_SECONDS,
        )
        .await
    {
        log::error!(
            "Failed to insert workspace signal output tokens cache for project [{}]: {:?}",
            project_id,
            e
        );
    }

    (input_tokens, cache_read_tokens, output_tokens)
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
            Ok(Some(info)) => info,
            Ok(None) => {
                log::warn!(
                    "Project [{}] or its workspace no longer exists, skipping bytes usage update",
                    project_id,
                );
                return Ok(());
            }
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
        &project_info.tier_name,
    )
    .await;

    Ok(())
}

/// Add `input_tokens`/`cache_read_tokens`/`output_tokens` of newly-billed
/// signal usage to the workspace's running token totals and fire any soft-limit
/// warnings the derived micro-USD cost crosses. Cache reads are a subset of
/// input tokens and are billed cheaper at compare time. Tokens are stored raw
/// (mirroring how step counts used to be pushed); cost is derived from them at
/// compare time.
#[cfg(feature = "signals")]
pub async fn update_workspace_signal_tokens(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    project_id: Uuid,
    input_tokens: u64,
    cache_read_tokens: u64,
    output_tokens: u64,
) -> Result<()> {
    let project_info = match get_workspace_info_for_project_id(
        db.clone(),
        cache.clone(),
        project_id,
    )
    .await
    {
        Ok(Some(info)) => info,
        Ok(None) => {
            log::warn!(
                "Project [{}] or its workspace no longer exists, skipping signal runs usage update",
                project_id,
            );
            return Ok(());
        }
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

    let input_key = format!("{WORKSPACE_SIGNAL_INPUT_TOKENS_USAGE_CACHE_KEY}:{workspace_id}");
    let cache_read_key =
        format!("{WORKSPACE_SIGNAL_CACHE_READ_TOKENS_USAGE_CACHE_KEY}:{workspace_id}");
    let output_key = format!("{WORKSPACE_SIGNAL_OUTPUT_TOKENS_USAGE_CACHE_KEY}:{workspace_id}");

    let cached_input = cache.get::<i64>(&input_key).await.ok().flatten();
    let cached_cache_read = cache.get::<i64>(&cache_read_key).await.ok().flatten();
    let cached_output = cache.get::<i64>(&output_key).await.ok().flatten();

    let (total_input, total_cache_read, total_output) = if let (Some(_), Some(_), Some(_)) =
        (cached_input, cached_cache_read, cached_output)
    {
        // All keys present - atomically bump each by this batch's tokens.
        // Roll back already-applied bumps on a later failure so the three
        // accumulators don't desync (which would skew the derived cost until
        // the next reseed/TTL). The batch is already in ClickHouse, so a
        // later reseed restores the true total. Best-effort: if a rollback
        // itself fails, the 24h TTL still bounds the skew.
        let new_input = match cache.increment(&input_key, input_tokens as i64).await {
            Ok(v) => v,
            Err(e) => {
                log::error!(
                    "Failed to increment workspace signal input tokens cache for project [{}]: {:?}",
                    project_id,
                    e
                );
                return Ok(());
            }
        };
        let new_cache_read = match cache
            .increment(&cache_read_key, cache_read_tokens as i64)
            .await
        {
            Ok(v) => v,
            Err(e) => {
                log::error!(
                    "Failed to increment workspace signal cache-read tokens cache for project [{}]: {:?}",
                    project_id,
                    e
                );
                if let Err(e) = cache.increment(&input_key, -(input_tokens as i64)).await {
                    log::error!(
                        "Failed to roll back workspace signal input tokens cache for project [{}]: {:?}",
                        project_id,
                        e
                    );
                }
                return Ok(());
            }
        };
        let new_output = match cache.increment(&output_key, output_tokens as i64).await {
            Ok(v) => v,
            Err(e) => {
                log::error!(
                    "Failed to increment workspace signal output tokens cache for project [{}]: {:?}",
                    project_id,
                    e
                );
                if let Err(e) = cache.increment(&input_key, -(input_tokens as i64)).await {
                    log::error!(
                        "Failed to roll back workspace signal input tokens cache for project [{}]: {:?}",
                        project_id,
                        e
                    );
                }
                if let Err(e) = cache
                    .increment(&cache_read_key, -(cache_read_tokens as i64))
                    .await
                {
                    log::error!(
                        "Failed to roll back workspace signal cache-read tokens cache for project [{}]: {:?}",
                        project_id,
                        e
                    );
                }
                return Ok(());
            }
        };
        (
            new_input.max(0) as u64,
            new_cache_read.max(0) as u64,
            new_output.max(0) as u64,
        )
    } else {
        // Cache miss on at least one key - reseed all from ClickHouse.
        // We do not add the current batch, because Clickhouse likely has
        // already ingested this payload. Even if it didn't, it's safer to
        // underestimate so soft limits aren't silently skipped and hard
        // limits aren't hit prematurely.
        let WorkspaceSignalTokens {
            input_tokens: input,
            cache_read_tokens: cache_read,
            output_tokens: output,
        } = match get_workspace_signal_tokens_by_project_ids(
            clickhouse,
            project_info.workspace_project_ids,
            project_info.reset_time,
        )
        .await
        {
            Ok(tokens) => tokens,
            Err(e) => {
                log::error!(
                    "Failed to get workspace signal tokens for project [{}]: {:?}",
                    project_id,
                    e
                );
                WorkspaceSignalTokens::default()
            }
        };
        cache
            .insert_with_ttl::<i64>(&input_key, input as i64, WORKSPACE_USAGE_TTL_SECONDS)
            .await?;
        cache
            .insert_with_ttl::<i64>(
                &cache_read_key,
                cache_read as i64,
                WORKSPACE_USAGE_TTL_SECONDS,
            )
            .await?;
        cache
            .insert_with_ttl::<i64>(&output_key, output as i64, WORKSPACE_USAGE_TTL_SECONDS)
            .await?;
        (input, cache_read, output)
    };

    // Soft limits are denominated in micro-USD; derive cost from the running
    // token totals at the workspace's tier rate (Pro discounted).
    let current_cost = crate::utils::signal_token_cost_micro_usd(
        total_input,
        total_cache_read,
        total_output,
        &project_info.tier_name,
    ) as i64;

    check_soft_limits(
        db.clone(),
        cache.clone(),
        queue,
        workspace_id,
        project_info.reset_time,
        UsageItem::SignalCost,
        current_cost,
        &project_info.tier_name,
    )
    .await;

    Ok(())
}

/// Check soft limits (usage warnings) against the current usage value and enqueue
/// notifications for any warnings that have not yet been sent this billing cycle.
#[allow(clippy::too_many_arguments)]
async fn check_soft_limits(
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    workspace_id: Uuid,
    reset_time: DateTime<Utc>,
    usage_item: UsageItem,
    current_value: i64,
    tier_name: &WorkspaceTierName,
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
            tier_name,
        )
        .await;
    }
}

/// Build and enqueue a soft-limit notification for workspace owners.
/// Deduplication is handled on the notification-worker side via a short-lived cache
/// lock, so this function simply constructs the message and pushes it to the queue.
#[allow(clippy::too_many_arguments)]
async fn send_soft_limit_notification(
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    workspace_id: Uuid,
    warning_id: Uuid,
    usage_item: &UsageItem,
    limit_value: i64,
    tier_name: &WorkspaceTierName,
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

    let usage_item_str = usage_item.to_string();

    let tier_included = match usage_item {
        UsageItem::Bytes => tier_name.included_bytes(),
        #[allow(deprecated)]
        UsageItem::SignalCost | UsageItem::SignalStepsProcessed => {
            tier_name.included_signal_cost_micro_usd()
        }
    };
    let at_tier_included_allowance = tier_included == Some(limit_value);
    let overage_billable = matches!(tier_name, WorkspaceTierName::Hobby | WorkspaceTierName::Pro);

    let notification_message = NotificationMessage {
        definition_type: NotificationDefinitionType::UsageWarning,
        definition_id: warning_id,
        workspace_id,
        project_id: None,
        notifications: vec![NotificationKind::UsageWarning {
            workspace_name,
            usage_label,
            formatted_limit,
            usage_item: usage_item_str,
            at_tier_included_allowance,
            tier_display_name: tier_name.display_name().to_string(),
            overage_billable,
        }],
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
        #[allow(deprecated)]
        UsageItem::SignalCost | UsageItem::SignalStepsProcessed => {
            // limit_value is in micro-USD (1e-6 USD); render as dollars.
            let dollars = limit_value as f64 / 1_000_000.0;
            ("Signals cost".to_string(), format!("${:.2}", dollars))
        }
    }
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

pub async fn get_workspace_info_for_project_id(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<Option<ProjectWithWorkspaceBillingInfo>> {
    let cache_key = format!("{PROJECT_CACHE_KEY}:{project_id}");
    let cache_res = cache
        .get::<ProjectWithWorkspaceBillingInfo>(&cache_key)
        .await;
    match cache_res {
        Ok(Some(info)) => Ok(Some(info)),
        Ok(None) | Err(_) => {
            let info =
                db::projects::get_project_and_workspace_billing_info(&db.pool, &project_id).await?;
            if let Some(ref info) = info {
                if let Err(e) = cache
                    .insert_with_ttl::<ProjectWithWorkspaceBillingInfo>(
                        &cache_key,
                        info.clone(),
                        PROJECT_CACHE_TTL_SECONDS,
                    )
                    .await
                {
                    log::error!("Failed to insert project info into cache: {:?}", e);
                }
            }
            Ok(info)
        }
    }
}
