use std::sync::Arc;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{prelude::FromRow, PgPool};
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{self, user::User},
    semantic_search::SemanticSearch,
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
    semantic_search: Arc<dyn SemanticSearch>,
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

    let workspace_api_keys =
        db::workspace::get_user_api_keys_in_workspace(pool, &project.workspace_id).await?;

    // Invalidate user cache for all users in workspace
    for api_key in workspace_api_keys {
        let remove_res = cache.remove::<User>(&api_key).await;
        match remove_res {
            Ok(_) => log::info!(
                "Invalidated user cache for user in workspace: {}",
                project.workspace_id
            ),
            Err(e) => log::error!("Could not invalidate user cache for user: {}", e),
        }
    }

    semantic_search
        .create_collection(project.id.to_string())
        .await?;
    log::info!("Created new index collection for project: {}", project.id);

    Ok(project)
}
