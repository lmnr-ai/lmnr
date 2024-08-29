use actix_web::{get, post, web, HttpResponse};
use serde::Deserialize;
use uuid::Uuid;

use super::error::workspace_error_to_http_error;
use crate::{
    cache::Cache,
    db::{
        self, limits,
        user::{get_by_email, User},
        workspace::WorkspaceError,
        DB,
    },
    routes::ResponseResult,
};

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct GetAllWorkspaceRequestParams {
    #[serde(default)]
    pub access_level: Option<String>,
}

#[get("")]
async fn get_all_workspaces_of_user(
    user: User,
    db: web::Data<DB>,
    params: web::Query<GetAllWorkspaceRequestParams>,
) -> ResponseResult {
    // TODO: Revise the logic and move the "owner" part to a separate route
    if params.access_level.as_ref().is_some_and(|s| s == "owner") {
        let workspaces = db::workspace::get_owned_workspaces(&db.pool, &user.id).await?;
        Ok(HttpResponse::Ok().json(workspaces))
    } else {
        let workspaces = db::workspace::get_all_workspaces_of_user(&db.pool, &user.id).await?;
        Ok(HttpResponse::Ok().json(workspaces))
    }
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
struct CreateWorkspaceRequest {
    name: String,
}

#[post("")]
async fn create_workspace(
    user: User,
    db: web::Data<DB>,
    req: web::Json<CreateWorkspaceRequest>,
) -> ResponseResult {
    let name = req.into_inner().name;
    let workspace = db::workspace::Workspace {
        id: Uuid::new_v4(),
        name,
    };

    let max_workspaces = limits::get_limits_for_user(&db.pool, &user.id)
        .await?
        .num_workspaces;
    let created_workspaces = db::workspace::get_owned_workspaces(&db.pool, &user.id)
        .await?
        .len() as i64;

    if max_workspaces > 0 && created_workspaces >= max_workspaces {
        return Err(workspace_error_to_http_error(
            WorkspaceError::LimitReached {
                entity: "workspaces".to_string(),
                limit: max_workspaces,
                usage: created_workspaces,
            },
        ));
    }
    db::workspace::create_new_workspace(&db.pool, &workspace).await?;
    db::workspace::add_owner_to_workspace(&db.pool, &user.id, &workspace.id).await?;

    Ok(HttpResponse::Ok().json(workspace))
}

#[post("{workspace_id}/users")]
async fn add_user_to_workspace(
    db: web::Data<DB>,
    path: web::Path<Uuid>,
    req: web::Json<AddUserRequest>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let workspace_id = path.into_inner();
    let email = req.into_inner().email;
    let num_users = db::workspace::number_of_users_in_workspace(&db.pool, &workspace_id).await?;
    let limits = limits::get_limits_for_workspace(&db.pool, &workspace_id).await?;
    let user_limit = if limits.members_per_workspace > 0 {
        limits.members_per_workspace + limits.additional_seats.unwrap_or_default()
    } else {
        limits.members_per_workspace
    };

    if user_limit > 0 && num_users >= user_limit {
        return Err(workspace_error_to_http_error(
            WorkspaceError::LimitReached {
                entity: "users".to_string(),
                limit: user_limit,
                usage: num_users,
            },
        ));
    }

    let user = get_by_email(&db.pool, &email).await?;
    if user.is_none() {
        return Err(workspace_error_to_http_error(WorkspaceError::UserNotFound(
            email.to_string(),
        )));
    }

    let user = user.unwrap();

    db::workspace::add_user_to_workspace_by_email(&db.pool, &email, &workspace_id).await?;

    // after user is added to workspace, we need to invalidate the cache
    let remove_res = cache.remove::<User>(&user.api_key.unwrap()).await;
    match remove_res {
        Ok(_) => log::info!("Invalidated user cache for user: {}", user.id),
        Err(e) => log::error!("Error removing user from cache: {}", e),
    }

    Ok(HttpResponse::Ok().finish())
}

#[get("{workspace_id}/can-add-users")]
pub async fn can_add_users_to_workspace(
    user: User,
    path: web::Path<Uuid>,
    db: web::Data<DB>,
) -> ResponseResult {
    let workspace_id = path.into_inner();
    let user_limits = db::limits::get_limits_for_user(&db.pool, &user.id).await?;
    let max_users = if user_limits.members_per_workspace < 0 {
        i64::MAX
    } else {
        user_limits.members_per_workspace + user_limits.additional_seats.unwrap_or_default()
    };

    let owned_workspaces = db::workspace::get_owned_workspaces(&db.pool, &user.id).await?;

    let existing_members =
        db::workspace::number_of_users_in_workspace(&db.pool, &workspace_id).await?;
    let can_create =
        owned_workspaces.iter().any(|w| w.id == workspace_id) && existing_members < max_users;
    Ok(HttpResponse::Ok().json(can_create))
}
