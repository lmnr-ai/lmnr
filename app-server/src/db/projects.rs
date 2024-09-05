use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{prelude::FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Deserialize, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: Option<Uuid>,
    pub name: String,
    pub workspace_id: Uuid,
}

pub async fn get_all_projects_for_user(pool: &PgPool, user_id: &Uuid) -> Result<Vec<Project>> {
    let projects = sqlx::query_as::<_, Project>(
        "SELECT
            projects.id,
            projects.name,
            projects.workspace_id
        FROM
            projects
            join workspaces on projects.workspace_id = workspaces.id
        WHERE
            projects.workspace_id in (
            SELECT
                workspace_id
            FROM
                members_of_workspaces
            WHERE
                user_id = $1
            )",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(projects)
}

pub async fn get_project(pool: &PgPool, project_id: &Uuid) -> Result<Project> {
    let project =
        sqlx::query_as::<_, Project>("SELECT id, name, workspace_id FROM projects WHERE id = $1")
            .bind(project_id)
            .fetch_one(pool)
            .await?;

    Ok(project)
}

pub async fn create_project(pool: &PgPool, user_id: &Uuid, project: &Project) -> Result<Project> {
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
    .bind(&project.name)
    .bind(project.workspace_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(project)
}

pub async fn delete_project(pool: &PgPool, project_id: &Uuid) -> Result<()> {
    sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(project_id)
        .execute(pool)
        .await?;

    Ok(())
}
