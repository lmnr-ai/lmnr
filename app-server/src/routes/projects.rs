use std::sync::Arc;

use actix_web::{delete, get, post, web, HttpResponse};
use log::{error, info};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    cache::{keys::USER_CACHE_KEY, Cache, CacheTrait},
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GetProjectResponse {
    id: Uuid,
    name: String,
    workspace_id: Uuid,
    spans_this_month: i64,
    spans_limit: i64,
    events_this_month: i64,
    events_limit: i64,
    is_free_tier: bool,
}

#[get("")] // scope: /projects/{project_id}
async fn get_project(project_id: web::Path<Uuid>, db: web::Data<DB>) -> ResponseResult {
    let project_id = project_id.into_inner();

    let project = db::projects::get_project(&db.pool, &project_id).await?;

    let workspace_stats = db::stats::get_workspace_stats(&db.pool, &project.workspace_id).await?;

    let response = GetProjectResponse {
        id: project.id,
        name: project.name,
        workspace_id: project.workspace_id,
        spans_this_month: workspace_stats.spans_this_month,
        spans_limit: workspace_stats.spans_limit,
        events_this_month: workspace_stats.events_this_month,
        events_limit: workspace_stats.events_limit,
        is_free_tier: workspace_stats.tier_name.to_lowercase().trim() == "free",
    };

    Ok(HttpResponse::Ok().json(response))
}

#[delete("")]
async fn delete_project(
    project_id: web::Path<Uuid>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    semantic_search: web::Data<Arc<dyn SemanticSearch>>,
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
        let cache_key = format!("{USER_CACHE_KEY}:{}", key);
        let remove_res = cache.remove(&cache_key).await;
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
    req: web::Json<CreateProjectRequest>,
) -> ResponseResult {
    let req = req.into_inner();
    let cache = cache.into_inner();

    let project =
        projects::create_project(&db.pool, cache, &user.id, &req.name, req.workspace_id).await?;

    Ok(HttpResponse::Ok().json(project))
}
