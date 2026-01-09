pub mod auth;
pub mod crypto;

use anyhow::Result;
use log::warn;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::WORKSPACE_DEPLOYMENTS_CACHE_KEY};
use crate::db::workspaces::{WorkspaceDeployment, get_workspace_deployment_by_project_id};

/// Get workspace deployment configuration with caching.
pub async fn get_workspace_deployment(
    pool: &PgPool,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<WorkspaceDeployment> {
    let cache_key = format!("{WORKSPACE_DEPLOYMENTS_CACHE_KEY}:{project_id}");
    let cache_res = cache.get::<WorkspaceDeployment>(&cache_key).await;

    match cache_res {
        Ok(Some(config)) => Ok(config),
        Ok(None) | Err(_) => {
            let workspace_deployment =
                get_workspace_deployment_by_project_id(pool, &project_id).await?;

            if let Err(e) = cache
                .insert::<WorkspaceDeployment>(&cache_key, workspace_deployment.clone())
                .await
            {
                warn!(
                    "Failed to cache workspace deployment for project {}: {}",
                    project_id, e
                );
            };
            Ok(workspace_deployment)
        }
    }
}
