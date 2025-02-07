use std::collections::HashSet;
use std::sync::Arc;

use super::{GetMetricsQueryParams, ResponseResult};
use crate::ch::utils::get_bounds;
use crate::semantic_search::semantic_search_grpc::DateRanges;
use crate::semantic_search::SemanticSearch;
use crate::{
    ch::{self, modifiers::GroupByInterval, Aggregation},
    db::modifiers::{DateRange, RelativeDateInterval},
};
use actix_web::{get, post, web, HttpResponse};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const DEFAULT_SEARCH_LIMIT: u32 = 250;

#[derive(Deserialize)]
struct TraceSearchQueryParams {
    search: String,
    #[serde(default)]
    limit: Option<u32>,
    #[serde(default)]
    date_range: Option<DateRange>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TraceSearchResponse {
    trace_ids: HashSet<Uuid>,
    span_ids: HashSet<Uuid>,
}

#[get("traces/search")]
pub async fn search_traces(
    path: web::Path<Uuid>,
    query_params: web::Query<TraceSearchQueryParams>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let limit = query_params.limit.unwrap_or(DEFAULT_SEARCH_LIMIT);
    let params = query_params.into_inner();
    let search_query = params.search;
    let date_range = params.date_range;
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let spans = ch::spans::search_spans(clickhouse, project_id, &search_query).await?;

    let mut trace_ids = HashSet::new();
    let mut span_ids = HashSet::new();
    spans.iter().for_each(|span| {
        trace_ids.insert(span.trace_id);
        span_ids.insert(span.span_id);
    });

    let response = TraceSearchResponse {
        trace_ids,
        span_ids,
    };

    Ok(HttpResponse::Ok().json(response))
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
            x => {
                return Err(anyhow::anyhow!(
                    "{} grouping is not supported for traceCount metric",
                    x.to_string()
                )
                .into());
            }
        },
        TraceMetric::TraceLatencySeconds => {
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
            x => {
                return Err(anyhow::anyhow!(
                    "{} grouping is not supported for totalTokenCount metric",
                    x.to_string()
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
            x => {
                return Err(anyhow::anyhow!(
                    "{} grouping is not supported for costUsd metric",
                    x.to_string()
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
        TraceMetric::TraceCount => {
            let values = ch::spans::get_total_trace_count_metrics_absolute(
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
        TraceMetric::TraceLatencySeconds => {
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
        TraceMetric::TotalTokenCount => {
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
        TraceMetric::CostUsd => {
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
    }
}
