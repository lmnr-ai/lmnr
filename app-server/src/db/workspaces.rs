use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(sqlx::Type, Deserialize, Serialize, PartialEq, Clone, Debug, Default)]
#[sqlx(type_name = "TEXT", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DeploymentMode {
    #[default]
    CLOUD,
    HYBRID,
}

#[derive(Deserialize, Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDeployment {
    pub workspace_id: Uuid,
    pub mode: DeploymentMode,
    pub private_key: Option<String>,
    pub private_key_nonce: Option<String>,  
    pub public_key: Option<String>,
    pub data_plane_url: Option<String>,
    pub data_plane_url_nonce: Option<String>,
}

#[derive(Deserialize, Serialize, FromRow, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
}

pub async fn get_workspace(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<Option<Workspace>> {
    let workspace = sqlx::query_as::<_, Workspace>(
        "SELECT id, name FROM workspaces WHERE id = $1",
    )
    .bind(workspace_id)
    .fetch_optional(pool)
    .await?;

    Ok(workspace)
}

pub async fn get_workspace_deployment_by_project_id(
    pool: &PgPool,
    project_id: &Uuid,
) -> Result<WorkspaceDeployment> {
    let result = sqlx::query_as::<_, WorkspaceDeployment>(
        "
        SELECT
            projects.workspace_id,
            COALESCE(workspace_deployments.mode, 'CLOUD') as mode,
            workspace_deployments.public_key,
            workspace_deployments.private_key,
            workspace_deployments.private_key_nonce,
            workspace_deployments.data_plane_url,
            workspace_deployments.data_plane_url_nonce
        FROM
            projects
            LEFT JOIN workspace_deployments ON projects.workspace_id = workspace_deployments.workspace_id
        WHERE
            projects.id = $1",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(result)
}

pub async fn get_workspace_deployment_by_workspace_id(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> Result<WorkspaceDeployment> {
    let result = sqlx::query_as::<_, WorkspaceDeployment>(
        "
        SELECT
            $1 as workspace_id,
            COALESCE(workspace_deployments.mode, 'CLOUD') as mode,
            workspace_deployments.public_key,
            workspace_deployments.private_key,
            workspace_deployments.private_key_nonce,
            workspace_deployments.data_plane_url,
            workspace_deployments.data_plane_url_nonce
        FROM
            workspace_deployments
        WHERE
            workspace_deployments.workspace_id = $1",
    )
    .bind(workspace_id)
    .fetch_one(pool)
    .await;

    match result {
        Ok(deployment) => Ok(deployment),
        Err(sqlx::Error::RowNotFound) => {
            // No workspace_deployments row means CLOUD mode (the default)
            Ok(WorkspaceDeployment {
                workspace_id: *workspace_id,
                mode: DeploymentMode::CLOUD,
                private_key: None,
                private_key_nonce: None,
                public_key: None,
                data_plane_url: None,
                data_plane_url_nonce: None,
            })
        }
        Err(e) => Err(e.into()),
    }
}
