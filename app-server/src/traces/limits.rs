// TODO: move this from the traces module

use std::sync::Arc;

use anyhow::Result;
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{PROJECT_CACHE_KEY, WORKSPACE_BYTES_USAGE_CACHE_KEY, WORKSPACE_LIMITS_CACHE_KEY},
    },
    ch::limits::get_workspace_bytes_ingested_by_project_ids,
    db::{self, DB, projects::ProjectWithWorkspaceBillingInfo, stats::WorkspaceLimitsExceeded},
};

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
            let bytes_ingested = match get_workspace_bytes_ingested_by_project_ids(
                clickhouse.clone(),
                project_info.workspace_project_ids,
                project_info.reset_time,
            )
            .await
            {
                Ok(bytes_ingested) => bytes_ingested as i64,
                Err(e) => {
                    log::error!(
                        "Failed to get workspace bytes ingested for project [{}]: {:?}",
                        project_id,
                        e
                    );
                    0 as i64
                }
            };

            let workspace_limits_exceeded = WorkspaceLimitsExceeded {
                steps: false,
                bytes_ingested: bytes_ingested >= project_info.bytes_limit,
            };

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
        let project_info =
            match get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id).await {
                Ok(info) => info,
                Err(e) => {
                    log::error!(
                        "Failed to get workspace info for project [{}]: {:?}",
                        project_id,
                        e
                    );
                    return;
                }
            };
        let workspace_id = project_info.workspace_id;
        if project_info.tier_name.trim().to_lowercase() != "free" {
            // We don't need to update the workspace limits cache for non-free tiers
            return;
        }

        let bytes_usage_cache_key = format!("{WORKSPACE_BYTES_USAGE_CACHE_KEY}:{workspace_id}");
        let limits_cache_key = format!("{WORKSPACE_LIMITS_CACHE_KEY}:{workspace_id}");

        // First, try to read from cache to check if it exists
        let cache_result = cache.get::<i64>(&bytes_usage_cache_key).await;

        match cache_result {
            Ok(Some(_)) => {
                // Cache exists - atomically increment it
                let increment_result = cache
                    .increment(&bytes_usage_cache_key, written_bytes as i64)
                    .await;

                // Check if we've accumulated enough to trigger a recomputation
                if let Ok(Some(new_partial_usage)) = increment_result {
                    let workspace_limits_exceeded = WorkspaceLimitsExceeded {
                        steps: false,
                        bytes_ingested: new_partial_usage >= project_info.bytes_limit,
                    };

                    // Update the limits cache
                    let _ = cache
                        .insert::<WorkspaceLimitsExceeded>(
                            &limits_cache_key,
                            workspace_limits_exceeded,
                        )
                        .await;
                }
            }
            Ok(None) | Err(_) => {
                // Cache miss or error - perform full recomputation
                let bytes_ingested = match get_workspace_bytes_ingested_by_project_ids(
                    clickhouse.clone(),
                    project_info.workspace_project_ids,
                    project_info.reset_time,
                )
                .await
                {
                    Ok(bytes_ingested) => bytes_ingested as i64,
                    Err(e) => {
                        log::error!(
                            "Failed to get workspace bytes ingested for project [{}]: {:?}",
                            project_id,
                            e
                        );
                        0 as i64
                    }
                };

                let workspace_limits_exceeded = WorkspaceLimitsExceeded {
                    steps: false,
                    bytes_ingested: bytes_ingested >= project_info.bytes_limit,
                };

                let _ = cache
                    .insert::<WorkspaceLimitsExceeded>(&limits_cache_key, workspace_limits_exceeded)
                    .await;

                let _ = cache
                    .insert::<i64>(&bytes_usage_cache_key, bytes_ingested as i64)
                    .await;
            }
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
