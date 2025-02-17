use std::sync::Arc;

use actix_web::{delete, get, web, HttpResponse};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    db::{self, DB},
    routes::ResponseResult,
    semantic_search::SemanticSearch,
};

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
    semantic_search: web::Data<Arc<dyn SemanticSearch>>,
) -> ResponseResult {
    let project_id = project_id.into_inner();

    let project = db::projects::get_project(&db.pool, &project_id).await?;

    db::projects::delete_project(&db.pool, &project_id).await?;
    log::info!(
        "Deleted project: id: {}, name: {}, workspace_id: {}",
        project.id,
        project.name,
        project.workspace_id
    );

    semantic_search
        .delete_collections(project_id.to_string())
        .await?;

    Ok(HttpResponse::Ok().finish())
}
