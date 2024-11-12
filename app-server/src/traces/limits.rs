use std::sync::Arc;

use anyhow::Result;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{self, DB},
    projects::Project,
};

#[derive(Clone)]
pub struct WorkspaceLimitsExceeded {
    pub spans: bool,
}

pub async fn get_workspace_limit_exceeded_by_project_id(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<WorkspaceLimitsExceeded> {
    let workspace_id =
        get_workspace_id_for_project_id(db.clone(), cache.clone(), project_id).await?;
    let cache_res = cache
        .get::<WorkspaceLimitsExceeded>(&workspace_id.to_string())
        .await;
    match cache_res {
        Ok(Some(workspace_limits_exceeded)) => Ok(workspace_limits_exceeded),
        Ok(None) | Err(_) => {
            let workspace_stats = db::stats::get_workspace_stats(&db.pool, &workspace_id).await?;
            let is_free_tier = workspace_stats.tier_name.to_lowercase().trim() == "free";
            let workspace_limits_exceeded = WorkspaceLimitsExceeded {
                spans: workspace_stats.spans_this_month >= workspace_stats.spans_limit
                    && is_free_tier,
            };
            let _ = cache
                .insert::<WorkspaceLimitsExceeded>(
                    workspace_id.to_string(),
                    &workspace_limits_exceeded,
                )
                .await?;
            Ok(workspace_limits_exceeded)
        }
    }
}

/// Force updates the cache based on the DB values. This is done instead of invalidation,
/// somewhat like an async write-through cache.
pub async fn update_workspace_limit_exceeded_by_project_id(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<WorkspaceLimitsExceeded> {
    let workspace_id =
        get_workspace_id_for_project_id(db.clone(), cache.clone(), project_id).await?;

    update_workspace_limit_exceeded_by_workspace_id(db.clone(), cache.clone(), workspace_id).await
}

pub async fn update_workspace_limit_exceeded_by_workspace_id(
    db: Arc<DB>,
    cache: Arc<Cache>,
    workspace_id: Uuid,
) -> Result<WorkspaceLimitsExceeded> {
    let workspace_stats = db::stats::get_workspace_stats(&db.pool, &workspace_id).await?;
    let is_free_tier = workspace_stats.tier_name.to_lowercase().trim() == "free";
    let workspace_limits_exceeded = WorkspaceLimitsExceeded {
        spans: workspace_stats.spans_this_month >= workspace_stats.spans_limit && is_free_tier,
    };
    let _ = cache
        .insert::<WorkspaceLimitsExceeded>(workspace_id.to_string(), &workspace_limits_exceeded)
        .await?;

    Ok(workspace_limits_exceeded)
}

async fn get_workspace_id_for_project_id(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<Uuid> {
    let cache_res = cache.get::<Project>(&project_id.to_string()).await;
    match cache_res {
        Ok(Some(project)) => Ok(project.workspace_id),
        Ok(None) | Err(_) => {
            let project = db::projects::get_project(&db.pool, &project_id).await?;
            let _ = cache
                .insert::<Project>(project_id.to_string(), &project)
                .await?;
            Ok(project.workspace_id)
        }
    }
}
