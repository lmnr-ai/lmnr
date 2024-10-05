use actix_web::{delete, get, post, web, HttpResponse};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::db::{
    self,
    labels::{LabelSource, LabelType},
    user::User,
    DB,
};

use super::ResponseResult;

#[get("label-classes")]
pub async fn get_label_types(path: web::Path<Uuid>, db: web::Data<DB>) -> ResponseResult {
    let project_id = path.into_inner();
    let label_classes = db::labels::get_label_classes_by_project_id(&db.pool, project_id).await?;

    Ok(HttpResponse::Ok().json(label_classes))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateLabelClassRequest {
    name: String,
    label_type: LabelType,
    value_map: Vec<Value>,
    #[serde(default)]
    description: Option<String>,
}

#[post("label-classes")]
pub async fn create_label_class(
    path: web::Path<Uuid>,
    req: web::Json<CreateLabelClassRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let req = req.into_inner();
    let name = req.name;
    let label_type = req.label_type;
    let value_map = req.value_map;
    let description = req.description;

    let id = Uuid::new_v4();
    let label_class = db::labels::create_label_class(
        &db.pool,
        id,
        name,
        project_id,
        &label_type,
        value_map,
        description,
    )
    .await?;

    Ok(HttpResponse::Ok().json(label_class))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateLabelClassRequest {
    description: Option<String>,
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

    let label_class =
        db::labels::update_label_class(&db.pool, project_id, class_id, description).await?;

    Ok(HttpResponse::Ok().json(label_class))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSpanLabelRequest {
    value: f64,
    class_id: Uuid,
}

#[post("spans/{span_id}/labels")]
pub async fn update_span_label(
    path: web::Path<(Uuid, Uuid)>,
    req: web::Json<UpdateSpanLabelRequest>,
    db: web::Data<DB>,
    user: User,
) -> ResponseResult {
    let (_project_id, span_id) = path.into_inner();
    let req = req.into_inner();
    let class_id = req.class_id;
    let value = req.value;
    let user_id = user.id;

    let label = db::labels::update_span_label(
        &db.pool,
        span_id,
        value,
        Some(user_id),
        class_id,
        LabelSource::MANUAL,
    )
    .await?;
    Ok(HttpResponse::Ok().json(label))
}

#[delete("spans/{span_id}/labels/{label_id}")]
pub async fn delete_span_label(
    path: web::Path<(Uuid, Uuid, Uuid)>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (_project_id, span_id, label_id) = path.into_inner();

    db::labels::delete_span_label(&db.pool, span_id, label_id).await?;

    Ok(HttpResponse::Ok().finish())
}

#[get("spans/{span_id}/labels")]
pub async fn get_span_labels(db: web::Data<DB>, path: web::Path<(Uuid, Uuid)>) -> ResponseResult {
    let (_project_id, span_id) = path.into_inner();

    let labels = db::labels::get_span_labels(&db.pool, span_id).await?;

    Ok(HttpResponse::Ok().json(labels))
}
