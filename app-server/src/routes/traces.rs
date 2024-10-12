use super::{GetMetricsQueryParams, ResponseResult};
use super::{PaginatedGetQueryParams, PaginatedResponse, DEFAULT_PAGE_SIZE};
use crate::ch::utils::get_bounds;
use crate::{
    ch::{self, modifiers::GroupByInterval, Aggregation},
    db::{
        self,
        events::EventWithTemplateName,
        modifiers::{DateRange, Filter, RelativeDateInterval},
        spans::Span,
        trace::{Session, Trace, TraceWithParentSpanAndEvents},
        DB,
    },
};
use actix_web::{get, post, web, HttpResponse};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[get("traces")]
pub async fn get_traces(
    path: web::Path<Uuid>,
    db: web::Data<DB>,
    query_params: web::Query<PaginatedGetQueryParams>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let query_params = query_params.into_inner();
    let limit = query_params.page_size.unwrap_or(DEFAULT_PAGE_SIZE);
    let offset = limit * query_params.page_number;
    let filters = Filter::from_url_params(query_params.filter);
    let mut filters_vec = filters.unwrap_or_default();
    filters_vec.push(Filter {
        filter_column: "trace_type".to_string(),
        filter_operator: db::modifiers::FilterOperator::Eq,
        filter_value: Value::String("DEFAULT".to_string()),
    });
    let date_range = query_params.date_range;
    let text_search_filter = query_params.search;

    let traces = db::trace::get_traces(
        &db.pool,
        project_id,
        limit,
        offset,
        &Some(filters_vec.clone()),
        &date_range,
        text_search_filter.clone(),
    )
    .await?;
    let total_count = db::trace::count_traces(
        &db.pool,
        project_id,
        &Some(filters_vec),
        &date_range,
        text_search_filter,
    )
    .await?;
    let any_in_project = if total_count == 0 {
        db::trace::count_all_traces_in_project(&db.pool, project_id).await? > 0
    } else {
        true
    };

    let response = PaginatedResponse::<TraceWithParentSpanAndEvents> {
        total_count,
        items: traces,
        any_in_project,
    };

    Ok(HttpResponse::Ok().json(response))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TraceWithSpanPreviews {
    #[serde(flatten)]
    trace: Trace,
    spans: Vec<Span>,
}

#[get("traces/{trace_id}")]
pub async fn get_single_trace(
    params: web::Path<(Uuid, Uuid)>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (_project_id, trace_id) = params.into_inner();

    let trace = db::trace::get_single_trace(&db.pool, trace_id).await?;
    let span_previews = db::spans::get_span_previews(&db.pool, trace_id).await?;

    let trace_with_spans = TraceWithSpanPreviews {
        trace,
        spans: span_previews,
    };

    Ok(HttpResponse::Ok().json(trace_with_spans))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpanWithEvents {
    #[serde(flatten)]
    span: Span,
    events: Vec<EventWithTemplateName>,
}

#[get("spans/{span_id}")]
pub async fn get_single_span(params: web::Path<(Uuid, Uuid)>, db: web::Data<DB>) -> ResponseResult {
    let (_project_id, span_id) = params.into_inner();

    let span = db::spans::get_span(&db.pool, span_id).await?;
    let events = db::events::get_events_for_span(&db.pool, span_id).await?;

    let span_with_events = SpanWithEvents { span, events };

    Ok(HttpResponse::Ok().json(span_with_events))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum TraceMetric {
    TraceCount,
    TraceLatencySeconds,
    TotalTokenCount,
    CostUsd,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetTraceMetricsParams {
    metric: TraceMetric,
    /// Total or average
    #[serde(flatten)]
    base_params: GetMetricsQueryParams,
}

/// Get metrics for a single metric type (e.g. for average trace latency)
#[post("traces/metrics")]
pub async fn get_traces_metrics(
    params: web::Path<Uuid>,
    clickhouse: web::Data<clickhouse::Client>,
    req: web::Json<GetTraceMetricsParams>,
) -> ResponseResult {
    let project_id = params.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let req = req.into_inner();
    let metric = req.metric;
    let aggregation = req.base_params.aggregation;
    let date_range = req.base_params.date_range.as_ref();
    let group_by_interval = req.base_params.group_by_interval;

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
            if interval.past_hours == "all" {
                let (start_time, end_time) =
                    get_bounds(&clickhouse, &project_id, "spans", "start_time").await?;
                return get_metrics_absolute_time(
                    clickhouse.clone(),
                    metric,
                    project_id,
                    start_time,
                    end_time,
                    group_by_interval,
                    aggregation,
                )
                .await;
            } else {
                let past_hours = interval
                    .past_hours
                    .parse::<i64>()
                    .map_err(|e| anyhow::anyhow!("Failed to parse past_hours as i64: {}", e))?;
                get_metrics_relative_time(
                    clickhouse.clone(),
                    metric,
                    project_id,
                    past_hours,
                    group_by_interval,
                    aggregation,
                )
                .await
            }
        }
        DateRange::Absolute(interval) => {
            get_metrics_absolute_time(
                clickhouse.clone(),
                metric,
                project_id,
                interval.start_date,
                interval.end_date,
                group_by_interval,
                aggregation,
            )
            .await
        }
    }
}

#[get("sessions")]
pub async fn get_sessions(
    db: web::Data<DB>,
    project_id: web::Path<Uuid>,
    params: web::Query<PaginatedGetQueryParams>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let date_range = &params.date_range;
    let limit = params.page_size.unwrap_or(DEFAULT_PAGE_SIZE);
    let offset = limit * (params.page_number);
    let filters = Filter::from_url_params(params.filter.clone());
    let sessions =
        db::trace::get_sessions(&db.pool, project_id, limit, offset, &filters, date_range).await?;

    let total_count = db::trace::count_sessions(&db.pool, project_id, &filters, date_range).await?;
    let any_in_project = if total_count == 0 {
        db::trace::count_all_sessions_in_project(&db.pool, project_id).await? > 0
    } else {
        true
    };
    let response = PaginatedResponse::<Session> {
        total_count,
        items: sessions,
        any_in_project,
    };
    Ok(HttpResponse::Ok().json(response))
}

async fn get_metrics_relative_time(
    clickhouse: clickhouse::Client,
    metric: TraceMetric,
    project_id: Uuid,
    past_hours: i64,
    group_by_interval: GroupByInterval,
    aggregation: Aggregation,
) -> ResponseResult {
    match metric {
        TraceMetric::TraceCount => match aggregation {
            Aggregation::Average => {
                return Err(anyhow::anyhow!(
                    "Average grouping is not supported for traceCount metric"
                )
                .into());
            }
            Aggregation::Total => {
                let values = ch::spans::get_total_trace_count_metrics_relative(
                    clickhouse,
                    group_by_interval,
                    project_id,
                    past_hours,
                )
                .await?;

                Ok(HttpResponse::Ok().json(values))
            }
        },
        TraceMetric::TraceLatencySeconds => match aggregation {
            Aggregation::Total => {
                return Err(anyhow::anyhow!(
                    "Total grouping is not supported for traceLatency metric"
                )
                .into());
            }
            Aggregation::Average => {
                let values = ch::spans::get_trace_latency_seconds_metrics_relative(
                    clickhouse,
                    group_by_interval,
                    project_id,
                    past_hours,
                    aggregation,
                )
                .await?;

                Ok(HttpResponse::Ok().json(values))
            }
        },
        TraceMetric::TotalTokenCount => match aggregation {
            Aggregation::Total => {
                let values = ch::spans::get_total_token_count_metrics_relative(
                    clickhouse,
                    group_by_interval,
                    project_id,
                    past_hours,
                    aggregation,
                )
                .await?;

                Ok(HttpResponse::Ok().json(values))
            }
            Aggregation::Average => {
                return Err(anyhow::anyhow!(
                    "Average grouping is not supported for totalTokenCount metric"
                )
                .into());
            }
        },
        TraceMetric::CostUsd => match aggregation {
            Aggregation::Total => {
                let values = ch::spans::get_cost_usd_metrics_relative(
                    clickhouse,
                    group_by_interval,
                    project_id,
                    past_hours,
                    aggregation,
                )
                .await?;

                Ok(HttpResponse::Ok().json(values))
            }
            Aggregation::Average => {
                return Err(anyhow::anyhow!(
                    "Average grouping is not supported for costUsd metric"
                )
                .into());
            }
        },
    }
}

async fn get_metrics_absolute_time(
    clickhouse: clickhouse::Client,
    metric: TraceMetric,
    project_id: Uuid,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    group_by_interval: GroupByInterval,
    aggregation: Aggregation,
) -> ResponseResult {
    match metric {
        TraceMetric::TraceCount => match aggregation {
            Aggregation::Average => {
                return Err(anyhow::anyhow!(
                    "Average grouping is not supported for traceCount metric"
                )
                .into());
            }
            Aggregation::Total => {
                let values = ch::spans::get_total_trace_count_metrics_absolute(
                    clickhouse,
                    group_by_interval,
                    project_id,
                    start_time,
                    end_time,
                )
                .await?;

                Ok(HttpResponse::Ok().json(values))
            }
        },
        TraceMetric::TraceLatencySeconds => match aggregation {
            Aggregation::Total => {
                return Err(anyhow::anyhow!(
                    "Total grouping is not supported for traceLatency metric"
                )
                .into());
            }
            Aggregation::Average => {
                let values = ch::spans::get_trace_latency_seconds_metrics_absolute(
                    clickhouse,
                    group_by_interval,
                    project_id,
                    start_time,
                    end_time,
                    aggregation,
                )
                .await?;

                Ok(HttpResponse::Ok().json(values))
            }
        },
        TraceMetric::TotalTokenCount => match aggregation {
            Aggregation::Total => {
                let values = ch::spans::get_total_token_count_metrics_absolute(
                    clickhouse,
                    group_by_interval,
                    project_id,
                    start_time,
                    end_time,
                    aggregation,
                )
                .await?;

                Ok(HttpResponse::Ok().json(values))
            }
            Aggregation::Average => {
                return Err(anyhow::anyhow!(
                    "Average grouping is not supported for totalTokenCount metric"
                )
                .into());
            }
        },
        TraceMetric::CostUsd => match aggregation {
            Aggregation::Total => {
                let values = ch::spans::get_cost_usd_metrics_absolute(
                    clickhouse,
                    group_by_interval,
                    project_id,
                    start_time,
                    end_time,
                    aggregation,
                )
                .await?;

                Ok(HttpResponse::Ok().json(values))
            }
            Aggregation::Average => {
                return Err(anyhow::anyhow!(
                    "Average grouping is not supported for costUsd metric"
                )
                .into());
            }
        },
    }
}
