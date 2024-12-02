use std::collections::HashMap;

use actix_web::{delete, get, post, web, HttpResponse};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::db::{self, labels::LabelSource, user::User, DB};

use super::ResponseResult;

#[get("label-classes")]
pub async fn get_label_types(path: web::Path<Uuid>, db: web::Data<DB>) -> ResponseResult {
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSpanLabelRequest {
    value: f64,
    class_id: Uuid,
    reasoning: Option<String>,
    source: LabelSource,
    #[serde(default)]
    datapoint_id: Option<Uuid>,
    #[serde(default)]
    score_name: Option<String>,
}

#[post("spans/{span_id}/labels")]
pub async fn update_span_label(
    path: web::Path<(Uuid, Uuid)>,
    req: web::Json<UpdateSpanLabelRequest>,
    db: web::Data<DB>,
    user: User,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let (project_id, span_id) = path.into_inner();
    let req = req.into_inner();
    let class_id = req.class_id;
    let value = req.value;
    let reasoning = req.reasoning;
    let source = req.source;
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let datapoint_id = req.datapoint_id;
    let score_name = req.score_name;

    // evaluator was triggered from the UI
    // so the source is AUTO
    let user_id = if source == LabelSource::AUTO {
        None
    } else {
        Some(user.id)
    };

    let Some(label_class) = db::labels::get_label_class(&db.pool, project_id, class_id).await?
    else {
        return Ok(HttpResponse::BadRequest().body("Label class not found"));
    };

    let value_map =
        serde_json::from_value::<HashMap<String, f64>>(label_class.value_map).unwrap_or_default();

    let Some(value_key) = value_map
        .iter()
        .find(|(_, val)| *val == &value)
        .map(|(key, _)| key.clone())
    else {
        return Ok(HttpResponse::BadRequest().body("Invalid value"));
    };

    let id = Uuid::new_v4();
    let label = crate::labels::insert_or_update_label(
        &db.pool,
        clickhouse.clone(),
        project_id,
        id,
        span_id,
        class_id,
        user_id,
        label_class.name,
        value_key,
        value,
        source,
        reasoning,
    )
    .await?;

    if let Some(datapoint_id) = datapoint_id {
        crate::evaluations::add_evaluation_score_from_label(
            db.into_inner(),
            clickhouse.clone(),
            project_id,
            label.id,
            datapoint_id,
            value,
            score_name.unwrap_or_default(),
        )
        .await?;
    }

    Ok(HttpResponse::Ok().json(label))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteLabelParams {
    #[serde(default)]
    datapoint_id: Option<Uuid>,
}

#[delete("spans/{span_id}/labels/{label_id}")]
pub async fn delete_span_label(
    path: web::Path<(Uuid, Uuid, Uuid)>,
    query: web::Query<DeleteLabelParams>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let (project_id, span_id, label_id) = path.into_inner();
    let query = query.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let datapoint_id = query.datapoint_id;
    db::labels::delete_span_label(&db.pool, span_id, label_id).await?;
    crate::ch::labels::delete_label(clickhouse.clone(), project_id, span_id, label_id).await?;

    if let Some(datapoint_id) = datapoint_id {
        db::evaluations::delete_evaluation_score(&db.pool, project_id, datapoint_id, label_id)
            .await?;
        crate::ch::evaluation_scores::delete_evaluation_score(
            clickhouse.clone(),
            project_id,
            datapoint_id,
            label_id,
        )
        .await?;
    }

    Ok(HttpResponse::Ok().finish())
}

#[get("spans/{span_id}/labels")]
pub async fn get_span_labels(db: web::Data<DB>, path: web::Path<(Uuid, Uuid)>) -> ResponseResult {
    let (_project_id, span_id) = path.into_inner();

    let labels = db::labels::get_span_labels(&db.pool, span_id).await?;

    Ok(HttpResponse::Ok().json(labels))
}
