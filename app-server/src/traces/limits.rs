// TODO: move this from the traces module

use std::sync::Arc;

use anyhow::Result;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{PROJECT_CACHE_KEY, WORKSPACE_LIMITS_CACHE_KEY},
    },
    ch,
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

        let cache_key = format!("{WORKSPACE_LIMITS_CACHE_KEY}:{workspace_id}");
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
        cache
            .insert::<WorkspaceLimitsExceeded>(&cache_key, workspace_limits_exceeded.clone())
            .await
            .unwrap();
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
