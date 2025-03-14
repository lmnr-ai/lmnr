use actix_web::{delete, get, post, web, HttpResponse};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::db::{self, DB};

use super::ResponseResult;

#[get("label-classes")]
pub async fn get_label_classes(path: web::Path<Uuid>, db: web::Data<DB>) -> ResponseResult {
    let project_id = path.into_inner();
    let label_classes =
        db::labels::get_label_classes_by_project_id(&db.pool, project_id, None).await?;

    Ok(HttpResponse::Ok().json(label_classes))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateLabelClassRequest {
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    evaluator_runnable_graph: Option<Value>,
}

#[post("label-classes/{class_id}")]
pub async fn update_label_class(
    path: web::Path<(Uuid, Uuid)>,
    req: web::Json<UpdateLabelClassRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (project_id, class_id) = path.into_inner();
    let req = req.into_inner();
    let description = req.description;
    let evaluator_runnable_graph = req.evaluator_runnable_graph;

    let label_class = db::labels::update_label_class(
        &db.pool,
        project_id,
        class_id,
        description,
        evaluator_runnable_graph,
    )
    .await?;

    Ok(HttpResponse::Ok().json(label_class))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterLabelClassRequest {
    path: String,
}

#[post("label-classes/{class_id}/registered-paths")]
pub async fn register_label_class_for_path(
    path: web::Path<(Uuid, Uuid)>,
    req: web::Json<RegisterLabelClassRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (project_id, class_id) = path.into_inner();
    let req = req.into_inner();
    let path = req.path;

    db::labels::register_label_class_for_path(&db.pool, project_id, class_id, &path).await?;

    Ok(HttpResponse::Ok().finish())
}

#[delete("label-classes/{class_id}/registered-paths/{id}")]
pub async fn remove_label_class_from_path(
    path: web::Path<(Uuid, Uuid, Uuid)>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (project_id, class_id, id) = path.into_inner();

    db::labels::remove_label_class_from_path(&db.pool, project_id, class_id, id).await?;

    Ok(HttpResponse::Ok().finish())
}

#[derive(Deserialize)]
struct PathQuery {
    path: String,
}

#[get("label-classes/registered-paths")]
pub async fn get_registered_label_classes_for_path(
    project_id: web::Path<Uuid>,
    query: web::Query<PathQuery>,
    db: web::Data<DB>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let path = &query.path;

    let label_classes =
        db::labels::get_registered_label_classes_for_path(&db.pool, project_id, path).await?;

    Ok(HttpResponse::Ok().json(label_classes))
}
