// TODO: move this from the traces module

use std::sync::Arc;

use anyhow::Result;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{PROJECT_CACHE_KEY, WORKSPACE_LIMITS_CACHE_KEY, WORKSPACE_PARTIAL_USAGE_CACHE_KEY},
    },
    ch,
    db::{self, DB, projects::ProjectWithWorkspaceBillingInfo, stats::WorkspaceLimitsExceeded},
};

// Threshold in bytes (16MB) - only recompute workspace limits after this much data is written
const RECOMPUTE_THRESHOLD_BYTES: usize = 16 * 1024 * 1024; // 16MB

pub async fn get_workspace_limit_exceeded_by_project_id(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<WorkspaceLimitsExceeded> {
    let project_info =
        get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id).await?;
    if project_info.tier_name.trim().to_lowercase() != "free" {
        // Short-circuit for non-free tiers, as they are not subject to limits
        return Ok(WorkspaceLimitsExceeded {
            steps: false,
            bytes_ingested: false,
        });
    }
    let workspace_id = project_info.workspace_id;
    let cache_key = format!("{WORKSPACE_LIMITS_CACHE_KEY}:{workspace_id}");
    let cache_res = cache.get::<WorkspaceLimitsExceeded>(&cache_key).await;
    match cache_res {
        Ok(Some(workspace_limits_exceeded)) => Ok(workspace_limits_exceeded),
        Ok(None) | Err(_) => {
            let workspace_limits_exceeded = is_workspace_over_limit(
                clickhouse,
                project_info.workspace_project_ids,
                project_info.bytes_limit,
                project_info.reset_time,
            )
            .await?;
            let _ = cache
                .insert::<WorkspaceLimitsExceeded>(&cache_key, workspace_limits_exceeded.clone())
                .await;
            Ok(workspace_limits_exceeded)
        }
    }
}

pub async fn update_workspace_limit_exceeded_by_project_id(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    project_id: Uuid,
    written_bytes: usize,
) -> Result<()> {
    tokio::spawn(async move {
        let project_info = get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id)
            .await
            .map_err(|e| {
                log::error!(
                    "Failed to get workspace info for project [{}]: {:?}",
                    project_id,
                    e
                );
            })
            .unwrap();
        let workspace_id = project_info.workspace_id;
        if project_info.tier_name.trim().to_lowercase() != "free" {
            // We don't need to update the workspace limits cache for non-free tiers
            return;
        }

        let partial_usage_cache_key = format!("{WORKSPACE_PARTIAL_USAGE_CACHE_KEY}:{workspace_id}");
        let limits_cache_key = format!("{WORKSPACE_LIMITS_CACHE_KEY}:{workspace_id}");

        // Get current partial usage from cache
        let cache_result = cache.get::<usize>(&partial_usage_cache_key).await;

        // If cache is missing or errored, we should recompute
        let (current_partial_usage, cache_available) = match cache_result {
            Ok(Some(value)) => (value, true),
            Ok(None) | Err(_) => (0, false),
        };

        let new_partial_usage = current_partial_usage + written_bytes;

        // Recompute if: cache was unavailable, or we've accumulated at least RECOMPUTE_THRESHOLD_BYTES
        let should_recompute = !cache_available || new_partial_usage >= RECOMPUTE_THRESHOLD_BYTES;

        if should_recompute {
            // Perform the heavy computation
            let workspace_limits_exceeded = is_workspace_over_limit(
                clickhouse,
                project_info.workspace_project_ids,
                project_info.bytes_limit,
                project_info.reset_time,
            )
            .await
            .map_err(|e| {
                log::error!(
                    "Failed to update workspace limit exceeded for project [{}]: {:?}",
                    project_id,
                    e
                );
            })
            .unwrap();

            // Update the limits cache
            let _ = cache
                .insert::<WorkspaceLimitsExceeded>(
                    &limits_cache_key,
                    workspace_limits_exceeded.clone(),
                )
                .await;

            // Reset the partial usage counter
            let _ = cache.insert::<usize>(&partial_usage_cache_key, 0).await;
        } else {
            // Just update the partial usage counter
            let _ = cache
                .insert::<usize>(&partial_usage_cache_key, new_partial_usage)
                .await;
        }
    });

    Ok(())
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
            let _ = cache
                .insert::<ProjectWithWorkspaceBillingInfo>(&cache_key, info.clone())
                .await;
            Ok(info)
        }
    }
}

async fn is_workspace_over_limit(
    clickhouse: clickhouse::Client,
    project_ids: Vec<Uuid>,
    bytes_limit: i64,
    reset_time: DateTime<Utc>,
) -> Result<WorkspaceLimitsExceeded> {
    let workspace_limits_exceeded =
        ch::limits::is_workspace_over_limit(clickhouse, project_ids, reset_time, bytes_limit)
            .await?;

    Ok(workspace_limits_exceeded)
}
