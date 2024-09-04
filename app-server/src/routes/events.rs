use std::collections::HashMap;

use actix_web::{delete, get, post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::db::{
    self,
    events::EventWithTemplateName,
    metrics::EventMetricsDatapoint,
    modifiers::{DateRange, Filter, GroupByInterval},
    DB,
};

use super::ResponseResult;

const DEFAULT_PAGE_SIZE: usize = 50;

#[get("event-templates")]
pub async fn get_event_templates(path: web::Path<Uuid>, db: web::Data<DB>) -> ResponseResult {
    let project_id = path.into_inner();
    let event_templates =
        db::event_templates::get_event_templates_by_project_id(&db.pool, project_id).await?;

    Ok(HttpResponse::Ok().json(event_templates))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateEventTemplateRequest {
    name: String,
    event_type: db::event_templates::EventType,
}

#[post("event-templates")]
pub async fn create_event_template(
    path: web::Path<Uuid>,
    req: web::Json<CreateEventTemplateRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let req = req.into_inner();
    let name = req.name;
    let event_type = req.event_type;

    let id = Uuid::new_v4();
    let event_template = db::event_templates::create_or_update_event_template(
        &db.pool, id, name, project_id, event_type,
    )
    .await?;

    Ok(HttpResponse::Ok().json(event_template))
}

#[get("event-templates/{template_id}")]
pub async fn get_event_template(
    path: web::Path<(Uuid, Uuid)>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (_project_id, template_id) = path.into_inner();
    let event_template =
        db::event_templates::get_event_template_by_id(&db.pool, &template_id).await?;

    Ok(HttpResponse::Ok().json(event_template))
}

#[post("event-templates/{template_id}")]
pub async fn update_event_template(
    path: web::Path<(Uuid, Uuid)>,
    db: web::Data<DB>,
    req: web::Json<CreateEventTemplateRequest>,
) -> ResponseResult {
    let (project_id, template_id) = path.into_inner();
    let req = req.into_inner();

    let event_template = db::event_templates::update_event_template(
        &db.pool,
        template_id,
        project_id,
        req.event_type,
    )
    .await?;

    Ok(HttpResponse::Ok().json(event_template))
}

#[delete("event-templates/{template_id}")]
pub async fn delete_event_template(
    path: web::Path<(Uuid, Uuid)>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (_project_id, template_id) = path.into_inner();
    db::event_templates::delete_event_template(&db.pool, &template_id).await?;

    Ok(HttpResponse::Ok().finish())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetEventsQuery {
    #[serde(default, flatten)]
    pub date_range: Option<db::modifiers::DateRange>,
}

#[get("event-templates/{template_id}/events")]
pub async fn get_events_by_template_id(
    path: web::Path<(Uuid, Uuid)>,
    db: web::Data<DB>,
    query_params: web::Query<GetEventsQuery>,
) -> ResponseResult {
    let (_project_id, template_id) = path.into_inner();
    let date_range = query_params.into_inner().date_range;
    let event_template =
        db::events::get_events_by_template_id(&db.pool, &template_id, date_range).await?;

    Ok(HttpResponse::Ok().json(event_template))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetEventTemplateMetricsQueryParams {
    #[serde(default)]
    #[serde(flatten)]
    pub date_range: Option<DateRange>,
    #[serde(default)]
    pub group_by_interval: GroupByInterval,
}

#[get("event-templates/{event_template_id}/metrics")]
pub async fn get_events_metrics(
    params: web::Path<(Uuid, Uuid)>,
    db: web::Data<DB>,
    query_params: web::Query<GetEventTemplateMetricsQueryParams>,
) -> ResponseResult {
    let (_project_id, event_template_id) = params.into_inner();
    let query_params = query_params.into_inner();
    let date_range = query_params.date_range;

    let metrics = db::metrics::get_event_metrics(
        &db.pool,
        date_range.as_ref(),
        query_params.group_by_interval.to_sql(),
        event_template_id,
    )
    .await?;

    Ok(HttpResponse::Ok().json(convert_event_metrics_response(&metrics)))
}

#[derive(Serialize)]
pub struct MetricTimeValue {
    pub time: i64,
    pub value: Option<f64>,
}

/// For now, this function simply converts db_datapoints to response datapoints,
/// but it can be extended with converting other metrics too
fn convert_event_metrics_response(
    db_datapoints: &Vec<EventMetricsDatapoint>,
) -> HashMap<String, Vec<MetricTimeValue>> {
    let mut points = HashMap::<String, Vec<MetricTimeValue>>::new();

    let counts = db_datapoints.iter().map(|point| {
        let time = point.time;
        let count = point.count;

        MetricTimeValue {
            time: time.timestamp(),
            value: Some(count as f64),
        }
    });

    points.insert("count".to_string(), counts.collect());
    points
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetEventsQueryParams {
    /// page number starting from 0
    #[serde(default)]
    page_number: usize,
    page_size: Option<usize>,
    #[serde(default)]
    filter: Value,
    #[serde(default)]
    #[serde(flatten)]
    pub date_range: Option<DateRange>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GetEventsResponse {
    total_entries: i64,
    events: Vec<EventWithTemplateName>,
    total_in_project: Option<i64>,
}

#[get("events")]
pub async fn get_events(
    path: web::Path<Uuid>,
    db: web::Data<DB>,
    query_params: web::Query<GetEventsQueryParams>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let query_params = query_params.into_inner();
    let limit = query_params.page_size.unwrap_or(DEFAULT_PAGE_SIZE);
    let offset = limit * (query_params.page_number);
    let filters = Filter::from_url_params(query_params.filter);
    let date_range = query_params.date_range;

    let events = db::events::get_events(
        &db.pool,
        project_id,
        limit,
        offset,
        filters.clone(),
        date_range.as_ref(),
    )
    .await?;
    let total_entries =
        db::events::count_events(&db.pool, project_id, filters, date_range.as_ref()).await?;
    let total_in_project = if total_entries == 0 {
        Some(db::events::count_all_events_in_project(&db.pool, project_id).await?)
    } else {
        None
    };
    let response = GetEventsResponse {
        total_entries,
        events,
        total_in_project,
    };

    Ok(HttpResponse::Ok().json(response))
}
