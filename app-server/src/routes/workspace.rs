use actix_web::{HttpResponse, get, post, web};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    db::{self, DB, user::User, workspace::WorkspaceWithProjects},
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
