use std::sync::Arc;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{prelude::FromRow, PgPool};
use uuid::Uuid;

use crate::{
    cache::{keys::USER_CACHE_KEY, Cache, CacheTrait},
    db::{self, user::User},
};

#[derive(Deserialize, Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub workspace_id: Uuid,
}

pub async fn create_project(
    pool: &PgPool,
    cache: Arc<Cache>,
    user_id: &Uuid,
    name: &str,
    workspace_id: Uuid,
) -> Result<Project> {
    let project = db::projects::create_project(pool, &user_id, name, workspace_id).await?;
    log::info!(
        "Created new project: id: {}, name: {}, workspace_id: {}",
        project.id,
        project.name,
        project.workspace_id
    );

    let workspace_user_api_keys =
        db::workspace::get_user_api_keys_in_workspace(pool, &project.workspace_id).await?;

    // Invalidate user cache for all users in workspace
    for api_key in workspace_user_api_keys {
        let user_cache_key = format!("{USER_CACHE_KEY}:{}", api_key);
        let remove_res = cache.remove::<User>(&user_cache_key).await;
        match remove_res {
            Ok(_) => log::info!(
                "Invalidated user cache for user in workspace: {}",
                project.workspace_id
            ),
            Err(e) => log::error!("Could not invalidate user cache for user: {}", e),
        }
    }

    Ok(project)
}
