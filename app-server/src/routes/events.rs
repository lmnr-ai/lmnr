use actix_web::{delete, get, post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    ch::{
        self,
        events::{get_time_bounds, IntMetricTimeValue},
        modifiers::GroupByInterval,
        utils::hours_ago,
        Aggregation,
    },
    db::{
        self,
        events::EventWithTemplateName,
        modifiers::{DateRange, Filter, RelativeDateInterval},
        DB,
    },
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
    event_type: db::event_templates::EventType,
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
enum EventMetric {
    EventCount,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetEventMetricsParams {
    /// e.g. "eventCount", "valueAverage" or "valueSum" for NUMBER type, p90, some metrics grouped by enum tags, etc.
    pub metric: EventMetric,
    /// Total or average, TODO: Find better name for this field
    pub aggregation: Aggregation,
    /// Date range per page
    #[serde(default)]
    #[serde(flatten)]
    pub date_range: Option<DateRange>,
    /// Group by interval per page
    #[serde(default)]
    pub group_by_interval: GroupByInterval,
}

#[post("event-templates/{event_template_id}/metrics")]
pub async fn get_events_metrics(
    params: web::Path<(Uuid, Uuid)>,
    clickhouse: web::Data<clickhouse::Client>,
    req: web::Json<GetEventMetricsParams>,
) -> ResponseResult {
    let (project_id, event_template_id) = params.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let req = req.into_inner();
    let metric = req.metric;
    let aggregation = req.aggregation;
    let date_range = req.date_range.as_ref();
    let group_by_interval = req.group_by_interval;

    // We expect the frontend to always provide a date range.
    // However, for smooth UX we default this to all time.
    let defaulted_range =
        date_range
            .cloned()
            .unwrap_or(DateRange::Relative(RelativeDateInterval {
                past_hours: "all".to_string(),
            }));

    match defaulted_range {
        DateRange::Relative(interval) => {
            let past_hours = if interval.past_hours == "all" {
                let time_bounds =
                    get_time_bounds(clickhouse.clone(), project_id, event_template_id).await?;
                if time_bounds.min_time == 0 {
                    let values: Vec<IntMetricTimeValue> = vec![];
                    return Ok(HttpResponse::Ok().json(values));
                }
                let past_hours = hours_ago(time_bounds.min_time);
                // FIXME: This is definitely to do with the query, and this patch is likely not a solution.
                past_hours.max(48)
            } else {
                let past_hours: i64 = interval.past_hours.parse().map_err(|_| {
                    anyhow::anyhow!("Failed to parse past_hours as i64: {}", interval.past_hours)
                })?;

                past_hours
            };
            match metric {
                EventMetric::EventCount => match aggregation {
                    Aggregation::Total => {
                        let values = ch::events::get_total_event_count_metrics_relative(
                            clickhouse,
                            group_by_interval,
                            project_id,
                            event_template_id,
                            past_hours,
                        )
                        .await?;
                        Ok(HttpResponse::Ok().json(values))
                    }
                    _ => {
                        return Err(anyhow::anyhow!(
                            "Unsupported aggregation {:?} for metric {}",
                            aggregation,
                            "eventCount"
                        )
                        .into());
                    }
                },
            }
        }
        DateRange::Absolute(interval) => match metric {
            EventMetric::EventCount => match aggregation {
                Aggregation::Total => {
                    let values = ch::events::get_total_event_count_metrics_absolute(
                        clickhouse,
                        group_by_interval,
                        project_id,
                        event_template_id,
                        interval.start_date,
                        interval.end_date,
                    )
                    .await?;
                    Ok(HttpResponse::Ok().json(values))
                }
                _ => {
                    return Err(anyhow::anyhow!(
                        "Unsupported aggregation {:?} for metric {}",
                        aggregation,
                        "eventCount"
                    )
                    .into());
                }
            },
        },
    }
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
