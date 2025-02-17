use actix_web::{get, post, web, HttpResponse};
use serde::Deserialize;
use uuid::Uuid;

use super::error::workspace_error_to_http_error;
use crate::{
    db::{
        self, stats,
        user::User,
        workspace::{WorkspaceError, WorkspaceWithProjects},
        DB,
    },
    features::{is_feature_enabled, Feature},
    routes::ResponseResult,
};

#[get("")]
async fn get_all_workspaces_of_user(user: User, db: web::Data<DB>) -> ResponseResult {
    let workspaces = db::workspace::get_all_workspaces_of_user(&db.pool, &user.id).await?;
    Ok(HttpResponse::Ok().json(workspaces))
}

#[get("{workspace_id}")]
async fn get_workspace(path: web::Path<Uuid>, db: web::Data<DB>) -> ResponseResult {
    let workspace_id = path.into_inner();

    let workspace = db::workspace::get_workspace(&db.pool, &workspace_id).await?;

    Ok(HttpResponse::Ok().json(workspace))
}

#[derive(Deserialize)]
struct AddUserRequest {
    email: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWorkspaceRequest {
    name: String,
    #[serde(default)]
    project_name: Option<String>,
}

#[post("")]
async fn create_workspace(
    user: User,
    db: web::Data<DB>,
    req: web::Json<CreateWorkspaceRequest>,
) -> ResponseResult {
    let req = req.into_inner();
    let name = req.name;
    let project_name = req.project_name;

    let workspace = db::workspace::create_new_workspace(&db.pool, Uuid::new_v4(), name).await?;
    log::info!(
        "Created new workspace: id {}, name {}, tier_name {}, is_free_tier {}",
        workspace.id,
        workspace.name,
        workspace.tier_name,
        workspace.is_free_tier
    );
    db::workspace::add_owner_to_workspace(&db.pool, &user.id, &workspace.id).await?;
    log::info!("Added owner {} to workspace: {}", user.id, workspace.id);

    let projects = if let Some(project_name) = project_name {
        let project =
            db::projects::create_project(&db.pool, &user.id, &project_name, workspace.id).await?;

        vec![project]
    } else {
        vec![]
    };

    let response = WorkspaceWithProjects {
        id: workspace.id,
        name: workspace.name,
        tier_name: workspace.tier_name,
        projects,
    };

    Ok(HttpResponse::Ok().json(response))
}

#[post("{workspace_id}/users")]
async fn add_user_to_workspace(
    db: web::Data<DB>,
    req_user: User,
    path: web::Path<Uuid>,
    req: web::Json<AddUserRequest>,
) -> ResponseResult {
    let workspace_id = path.into_inner();
    let email = req.into_inner().email;

    if is_feature_enabled(Feature::UsageLimit) {
        let limits = stats::get_workspace_stats(&db.pool, &workspace_id).await?;
        let user_limit = limits.members_limit;
        let num_users = limits.members;

        if num_users >= user_limit {
            return Err(workspace_error_to_http_error(
                WorkspaceError::LimitReached {
                    entity: "users".to_string(),
                    limit: user_limit,
                    usage: num_users,
                },
            ));
        }
    }

    if is_feature_enabled(Feature::UsageLimit) {
        let limits = stats::get_workspace_stats(&db.pool, &workspace_id).await?;
        let user_limit = limits.members_limit;
        let num_users = limits.members;

        if num_users >= user_limit {
            return Err(workspace_error_to_http_error(
                WorkspaceError::LimitReached {
                    entity: "users".to_string(),
                    limit: user_limit,
                    usage: num_users,
                },
            ));
        }
    }

    let owned_workspaces = db::workspace::get_owned_workspaces(&db.pool, &req_user.id).await?;
    if !owned_workspaces.iter().any(|w| w.id == workspace_id) {
        return Err(workspace_error_to_http_error(WorkspaceError::NotAllowed));
    }

    db::workspace::add_user_to_workspace_by_email(&db.pool, &email, &workspace_id).await?;

    Ok(HttpResponse::Ok().finish())
}
