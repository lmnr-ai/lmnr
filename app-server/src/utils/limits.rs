// TODO: move this from the traces module

use std::sync::Arc;

use anyhow::Result;
use tracing::instrument;
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{
            PROJECT_CACHE_KEY, WORKSPACE_BYTES_USAGE_CACHE_KEY,
            WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY,
        },
    },
    ch::limits::{
        get_workspace_bytes_ingested_by_project_ids, get_workspace_signal_runs_by_project_ids,
    },
    db::{self, DB, projects::ProjectWithWorkspaceBillingInfo},
};
// For workspaces over the limit, expire the cache after 24 hours,
// so that it resets in the next billing period (+/- 1 day).
const WORKSPACE_USAGE_EXCEEDED_TTL_SECONDS: u64 = 60 * 60 * 24; // 24 hours

pub async fn get_workspace_bytes_limit_exceeded(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<bool> {
    let project_info =
        get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id).await?;
    if project_info.tier_name.trim().to_lowercase() != "free" {
        // Short-circuit for non-free tiers, as they are not subject to limits
        return Ok(false);
    }
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
            let _ = cache
                .insert_with_ttl::<i64>(&cache_key, bytes, WORKSPACE_USAGE_EXCEEDED_TTL_SECONDS)
                .await;
            bytes
        }
    };

    Ok(bytes_ingested >= project_info.bytes_limit)
}

pub async fn get_workspace_signal_runs_limit_exceeded(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<bool> {
    let project_info =
        get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id).await?;
    if project_info.tier_name.trim().to_lowercase() != "free" {
        // Short-circuit for non-free tiers, as they are not subject to limits
        return Ok(false);
    }
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
            let _ = cache
                .insert_with_ttl::<i64>(&cache_key, runs, WORKSPACE_USAGE_EXCEEDED_TTL_SECONDS)
                .await;
            runs
        }
    };

    Ok(signal_runs >= project_info.signal_runs_limit)
}

#[instrument(skip(db, clickhouse, cache, project_id, bytes))]
pub async fn update_workspace_bytes_ingested(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
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
    if project_info.tier_name.trim().to_lowercase() != "free" {
        // We don't need to update the workspace usage cache for non-free tiers
        return Ok(());
    }
    let workspace_id = project_info.workspace_id;
    let cache_key = format!("{WORKSPACE_BYTES_USAGE_CACHE_KEY}:{workspace_id}");

    match cache.get::<i64>(&cache_key).await {
        Ok(Some(_)) => {
            // Cache exists - atomically increment it
            let _ = cache.increment(&cache_key, bytes as i64).await;
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
                .insert_with_ttl::<i64>(
                    &cache_key,
                    bytes_ingested,
                    WORKSPACE_USAGE_EXCEEDED_TTL_SECONDS,
                )
                .await?;
        }
    }

    Ok(())
}

#[instrument(skip(db, clickhouse, cache, project_id, runs))]
pub async fn update_workspace_signal_runs_used(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
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
    if project_info.tier_name.trim().to_lowercase() != "free" {
        // We don't need to update the workspace usage cache for non-free tiers
        return Ok(());
    }
    let workspace_id = project_info.workspace_id;
    let cache_key = format!("{WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY}:{workspace_id}");

    match cache.get::<i64>(&cache_key).await {
        Ok(Some(_)) => {
            // Cache exists - atomically increment it
            let _ = cache.increment(&cache_key, runs as i64).await;
        }
        Ok(None) | Err(_) => {
            // Cache miss - recompute from ClickHouse and populate the cache
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
                .insert_with_ttl::<i64>(
                    &cache_key,
                    signal_runs,
                    WORKSPACE_USAGE_EXCEEDED_TTL_SECONDS,
                )
                .await?;
        }
    }

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
            cache
                .insert::<ProjectWithWorkspaceBillingInfo>(&cache_key, info.clone())
                .await?;
            Ok(info)
        }
    }
}
