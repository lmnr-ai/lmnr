use anyhow::Context;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use super::projects::Project;
use super::stats::create_run_count_for_workspace;

#[derive(Debug, Deserialize, Serialize)]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
}

// create an error type with multiple variants
#[derive(thiserror::Error, Debug)]
pub enum WorkspaceError {
    #[error("User with email {0} not found")]
    UserNotFound(String),
    #[error("{0}")]
    UnhandledError(#[from] anyhow::Error),
    #[error("Hit limit of maximum {entity:?}: {limit:?}, current usage: {usage:?}")]
    LimitReached {
        entity: String,
        limit: i64,
        usage: i64,
    },
    #[error("Run limit reached")]
    RunLimitReached,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceWithProjects {
    pub id: Uuid,
    pub name: String,
    pub projects: Vec<Project>,
}

pub async fn get_all_workspaces_of_user(
    pool: &PgPool,
    user_id: &Uuid,
) -> anyhow::Result<Vec<WorkspaceWithProjects>> {
    let workspaces = sqlx::query_as!(
        Workspace,
        "select
            workspaces.id,
            workspaces.name
        from
            workspaces
            join members_of_workspaces on workspaces.id = members_of_workspaces.workspace_id
        where
            members_of_workspaces.user_id = $1
        order by
            workspaces.created_at DESC;",
        user_id
    )
    .fetch_all(pool)
    .await?;

    let mut workspaces_with_projects = Vec::new();
    for workspace in workspaces {
        let projects = sqlx::query_as!(
            Project,
            "select
                projects.id,
                projects.name,
                projects.workspace_id
            from
                projects
            where
                projects.workspace_id = $1;",
            workspace.id
        )
        .fetch_all(pool)
        .await?;

        workspaces_with_projects.push(WorkspaceWithProjects {
            id: workspace.id,
            name: workspace.name,
            projects,
        });
    }

    Ok(workspaces_with_projects)
}

pub async fn get_owned_workspaces(pool: &PgPool, user_id: &Uuid) -> anyhow::Result<Vec<Workspace>> {
    let workspaces = sqlx::query_as!(
        Workspace,
        "SELECT
            id,
            name
        FROM
            workspaces
        WHERE id IN (
            SELECT workspace_id FROM members_of_workspaces WHERE user_id = $1 AND member_role = 'owner'::workspace_role
        )",
        user_id
    )
    .fetch_all(pool)
    .await?;

    Ok(workspaces)
}

pub async fn create_new_workspace(pool: &PgPool, workspace: &Workspace) -> anyhow::Result<()> {
    sqlx::query!(
        "insert into workspaces (id, name) values ($1, $2);",
        workspace.id,
        workspace.name
    )
    .execute(pool)
    .await?;

    create_run_count_for_workspace(pool, &workspace.id).await?;

    Ok(())
}

pub async fn add_owner_to_workspace(
    pool: &PgPool,
    user_id: &Uuid,
    workspace_id: &Uuid,
) -> anyhow::Result<()> {
    sqlx::query!(
        "insert into members_of_workspaces
            (user_id, workspace_id, member_role)
        SELECT $1, $2, 'owner'::workspace_role;",
        user_id,
        workspace_id,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn add_user_to_workspace_by_email(
    pool: &PgPool,
    user_email: &str,
    workspace_id: &Uuid,
) -> anyhow::Result<()> {
    sqlx::query!(
        "INSERT INTO members_of_workspaces (user_id, workspace_id, member_role)
        SELECT id, $2 as workspace_id, 'member'::workspace_role FROM users
        WHERE users.email = $1;",
        user_email,
        workspace_id
    )
    .execute(pool)
    .await
    .map_err(|e| WorkspaceError::UnhandledError(e.into()))?;

    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceWithInfo {
    pub id: Uuid,
    pub name: String,
    pub users: Vec<WorkspaceUserInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceUserInfo {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub role: Option<String>,
}

/// Get workspace with its additional data by issuing separate queries for code clarity
pub async fn get_workspace(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<WorkspaceWithInfo> {
    let workspace = sqlx::query_as!(
        Workspace,
        "select
            id,
            name
        from
            workspaces
        where
            id = $1;",
        workspace_id
    )
    .fetch_optional(pool)
    .await?;

    match workspace {
        None => return Err(anyhow::anyhow!("Workspace not found")),
        Some(workspace) => {
            let users = sqlx::query_as!(
                WorkspaceUserInfo,
                "SELECT
                    users.id,
                    users.name,
                    users.email,
                    members_of_workspaces.member_role::text as role
                FROM
                    users
                    JOIN members_of_workspaces ON users.id = members_of_workspaces.user_id
                    JOIN api_keys ON users.id = api_keys.user_id
                WHERE
                    members_of_workspaces.workspace_id = $1
                ORDER BY
                    role DESC, -- for now, 'owner' comes before 'member'
                    members_of_workspaces.created_at ASC",
                workspace_id
            )
            .fetch_all(pool)
            .await?;

            Ok(WorkspaceWithInfo {
                id: workspace.id,
                name: workspace.name,
                users,
            })
        }
    }
}

pub async fn number_of_users_in_workspace(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<i64> {
    let count = sqlx::query!(
        "SELECT
            count(user_id) as count
        FROM
            members_of_workspaces
        WHERE workspace_id = $1",
        workspace_id
    )
    .fetch_one(pool)
    .await?;

    Ok(count.count.context("Could not count users")?)
}

pub async fn get_user_api_keys_in_workspace(
    pool: &PgPool,
    workspace_id: &Uuid,
) -> anyhow::Result<Vec<String>> {
    let records = sqlx::query!(
        "SELECT
            api_keys.api_key
        FROM members_of_workspaces
        JOIN api_keys ON members_of_workspaces.user_id = api_keys.user_id
        WHERE
            workspace_id = $1",
        workspace_id
    )
    .fetch_all(pool)
    .await?;

    Ok(records.iter().map(|r| r.api_key.clone()).collect())
}
