use std::sync::Arc;

use actix_web::{delete, get, post, web, HttpResponse};
use log::{error, info};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{self, user::User, DB},
    projects,
    routes::ResponseResult,
    semantic_search::SemanticSearch,
};

#[get("")] // scope: /projects
async fn get_projects(user: User, db: web::Data<DB>) -> ResponseResult {
    let projects = db::projects::get_all_projects_for_user(&db.pool, &user.id).await?;

    Ok(HttpResponse::Ok().json(projects))
}

#[get("")] // scope: /projects/{project_id}
async fn get_project(project_id: web::Path<Uuid>, db: web::Data<DB>) -> ResponseResult {
    let project_id = project_id.into_inner();

    let project = db::projects::get_project(&db.pool, &project_id).await?;

    Ok(HttpResponse::Ok().json(project))
}

#[delete("")]
async fn delete_project(
    project_id: web::Path<Uuid>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    semantic_search: web::Data<Arc<SemanticSearch>>,
) -> ResponseResult {
    let project_id = project_id.into_inner();

    let project = db::projects::get_project(&db.pool, &project_id).await?;

    db::projects::delete_project(&db.pool, &project_id).await?;
    info!(
        "Deleted project: id: {}, name: {}, workspace_id: {}",
        project.id, project.name, project.workspace_id
    );

    let user_keys =
        db::workspace::get_user_api_keys_in_workspace(&db.pool, &project.workspace_id).await?;

    // Cleanup: Invalidate user cache for all users in workspace
    for key in user_keys {
        let remove_res = cache.remove::<User>(&key).await;
        match remove_res {
            Ok(_) => info!(
                "Invalidated user cache for a user in workspace: {}",
                project.workspace_id
            ),
            Err(e) => error!("Could not invalidate user cache for user: {}", e),
        }
    }

    semantic_search
        .delete_collections(project_id.to_string())
        .await?;

    Ok(HttpResponse::Ok().finish())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectRequest {
    name: String,
    workspace_id: Uuid,
}

#[post("")]
async fn create_project(
    user: User,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    semantic_search: web::Data<Arc<SemanticSearch>>,
    req: web::Json<CreateProjectRequest>,
) -> ResponseResult {
    let req = req.into_inner();
    let cache = cache.into_inner();
    let semantic_search = semantic_search.into_inner().as_ref().clone();

    let project = projects::create_project(
        &db.pool,
        cache.clone(),
        semantic_search.clone(),
        &user.id,
        &req.name,
        req.workspace_id,
    )
    .await?;
    Ok(HttpResponse::Ok().json(project))
}
