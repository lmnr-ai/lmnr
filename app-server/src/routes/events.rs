use actix_web::{delete, get, post, web, HttpResponse};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    ch::{self, utils::get_bounds, Aggregation},
    db::{
        self,
        events::EventWithTemplateName,
        modifiers::{AbsoluteDateInterval, DateRange, Filter, RelativeDateInterval},
        DB,
    },
    routes::{PaginatedGetQueryParams, PaginatedResponse, DEFAULT_PAGE_SIZE},
};

use super::{GetMetricsQueryParams, ResponseResult};

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

#[get("event-templates/{template_id}/events")]
pub async fn get_events_by_template_id(
    path: web::Path<(Uuid, Uuid)>,
    db: web::Data<DB>,
    query_params: web::Query<PaginatedGetQueryParams>,
) -> ResponseResult {
    let (project_id, template_id) = path.into_inner();
    let query_params = query_params.into_inner();
    let date_range = query_params.date_range;
    let limit = query_params.page_size.unwrap_or(DEFAULT_PAGE_SIZE);
    let offset = limit * query_params.page_number;
    let filters = Filter::from_url_params(query_params.filter);

    let events = db::events::get_events_by_template_id(
        &db.pool,
        &template_id,
        &date_range,
        &filters,
        offset,
        limit,
    )
    .await?;

    let total_count =
        db::events::count_events_by_template_id(&db.pool, &template_id, &date_range, &filters)
            .await?;
    let any_in_project = if total_count > 0 {
        true
    } else {
        db::events::count_all_events_by_template_id_in_project(&db.pool, &template_id, &project_id)
            .await?
            > 0
    };

    let result = PaginatedResponse::<EventWithTemplateName> {
        items: events,
        total_count,
        any_in_project,
    };

    Ok(HttpResponse::Ok().json(result))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum EventMetric {
    EventCount,
}

impl std::fmt::Display for EventMetric {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventMetric::EventCount => write!(f, "eventCount"),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetEventMetricsParams {
    /// e.g. "eventCount", "valueAverage" or "valueSum" for NUMBER type, p90, some metrics grouped by enum tags, etc.
    metric: EventMetric,
    #[serde(flatten)]
    base_params: GetMetricsQueryParams,
}

#[get("event-templates/{event_template_id}/metrics")]
pub async fn get_events_metrics(
    params: web::Path<(Uuid, Uuid)>,
    clickhouse: web::Data<clickhouse::Client>,
    req: web::Query<GetEventMetricsParams>,
) -> ResponseResult {
    let (project_id, event_template_id) = params.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let req = req.into_inner();
    let metric = req.metric;
    let aggregation = req.base_params.aggregation;
    let date_range = req.base_params.date_range.as_ref();
    let group_by_interval = req.base_params.group_by_interval;

    let defaulted_range =
        date_range
            .cloned()
            .unwrap_or(DateRange::Relative(RelativeDateInterval {
                past_hours: "all".to_string(),
            }));

    let range = if let DateRange::Relative(RelativeDateInterval { past_hours }) = &defaulted_range {
        if past_hours == "all" {
            let (start_date, end_date) =
                get_bounds(&clickhouse, &project_id, "events", "timestamp").await?;
            DateRange::Absolute(AbsoluteDateInterval {
                start_date,
                end_date,
            })
        } else {
            defaulted_range
        }
    } else {
        defaulted_range
    };

    match range {
        DateRange::Relative(interval) => {
            let past_hours = interval
                .past_hours
                .parse::<i64>()
                .map_err(|e| anyhow::anyhow!("Failed to parse past_hours as i64: {}", e))?;
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
                        metric
                    )
                    .into());
                }
            },
        },
    }
}
