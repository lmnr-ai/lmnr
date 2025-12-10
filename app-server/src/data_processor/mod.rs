pub mod auth;
pub mod read;
pub mod write;

use anyhow::Result;
use moka::future::Cache;
use sqlx::PgPool;
use std::sync::OnceLock;
use std::time::Duration;
use uuid::Uuid;

use crate::db::projects::{DeploymentMode, get_workspace_by_project_id};

const WORKSPACE_CONFIG_CACHE_TTL_SECS: u64 = 60 * 60;
static WORKSPACE_CONFIG_CACHE: OnceLock<Cache<Uuid, WorkspaceConfig>> = OnceLock::new();

fn get_cache() -> &'static Cache<Uuid, WorkspaceConfig> {
    WORKSPACE_CONFIG_CACHE.get_or_init(|| {
        Cache::builder()
            .time_to_live(Duration::from_secs(WORKSPACE_CONFIG_CACHE_TTL_SECS))
            .build()
    })
}

#[derive(Clone, Debug)]
struct WorkspaceConfig {
    workspace_id: Uuid,
    deployment_mode: DeploymentMode,
    data_plane_url: Option<String>,
}

async fn get_workspace_config(pool: &PgPool, project_id: Uuid) -> Result<WorkspaceConfig> {
    let cache = get_cache();

    if let Some(config) = cache.get(&project_id).await {
        return Ok(config);
    }

    let workspace = get_workspace_by_project_id(pool, &project_id).await?;

    let config = WorkspaceConfig {
        workspace_id: workspace.id,
        deployment_mode: workspace.deployment_mode,
        data_plane_url: workspace.data_plane_url,
    };

    cache.insert(project_id, config.clone()).await;

    Ok(config)
}
