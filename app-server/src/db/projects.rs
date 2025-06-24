use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Deserialize, Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub workspace_id: Uuid,
}

pub async fn get_project(pool: &PgPool, project_id: &Uuid) -> Result<Project> {
    let project =
        sqlx::query_as::<_, Project>("SELECT id, name, workspace_id FROM projects WHERE id = $1")
            .bind(project_id)
            .fetch_one(pool)
            .await?;

    Ok(project)
}

pub async fn create_project(
    pool: &PgPool,
    user_id: &Uuid,
    name: &str,
    workspace_id: Uuid,
) -> Result<Project> {
    // create project only if user is part of the workspace which owns the project
    let project = sqlx::query_as::<_, Project>(
        "INSERT INTO projects (name, workspace_id)
        SELECT
            $1, $2
        FROM
            members_of_workspaces
        WHERE
            workspace_id = $2 and
            user_id = $3
        RETURNING
            id, name, workspace_id",
    )
    .bind(name)
    .bind(workspace_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(project)
}
