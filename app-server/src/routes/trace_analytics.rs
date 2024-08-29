use std::collections::HashMap;

use actix_web::{get, web, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::{
    self,
    modifiers::{DateRange, GroupByInterval},
    trace::EndpointTraceAnalyticDatapoint,
    DB,
};

use super::ResponseResult;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct GetTraceAnalyticsQueryParams {
    #[serde(default)]
    #[serde(flatten)]
    pub date_range: Option<DateRange>,
    #[serde(default)]
    pub group_by_interval: GroupByInterval,
}

#[derive(Serialize)]
pub struct AnalyticTimeValue {
    pub time: i64,
    pub value: Option<f64>,
}

#[get("traces/endpoint/{endpoint_id}/analytics")]
pub async fn get_endpoint_trace_analytics(
    params: web::Path<(Uuid, Uuid)>,
    db: web::Data<DB>,
    query_params: web::Query<GetTraceAnalyticsQueryParams>,
) -> ResponseResult {
    let (_project_id, endpoint_id) = params.into_inner();
    let date_range = query_params.date_range.clone().unwrap_or_default();
    let flat_points = db::trace::get_trace_analytics(
        &db.pool,
        &date_range,
        query_params.group_by_interval.to_sql(),
        &Some(endpoint_id),
        &None,
    )
    .await?;

    let points = convert_analytics_response(&flat_points);

    Ok(HttpResponse::Ok().json(points))
}

#[get("traces/analytics")]
pub async fn get_project_trace_analytics(
    params: web::Path<Uuid>,
    db: web::Data<DB>,
    query_params: web::Query<GetTraceAnalyticsQueryParams>,
) -> ResponseResult {
    let project_id = params.into_inner();
    let date_range = query_params.date_range.clone().unwrap_or_default();
    let flat_points = db::trace::get_trace_analytics(
        &db.pool,
        &date_range,
        query_params.group_by_interval.to_sql(),
        &None,
        &Some(project_id),
    )
    .await?;

    let points = convert_analytics_response(&flat_points);

    Ok(HttpResponse::Ok().json(points))
}

fn convert_analytics_response(
    db_datapoints: &Vec<EndpointTraceAnalyticDatapoint>,
) -> HashMap<String, Vec<AnalyticTimeValue>> {
    let mut points = HashMap::<String, Vec<AnalyticTimeValue>>::new();
    let (token_counts, (latencies, (approximate_costs, run_counts))): (
        Vec<_>,
        (Vec<_>, (Vec<_>, Vec<_>)),
    ) = db_datapoints
        .iter()
        .map(|point| {
            let time = point.time;
            let token_count = point.avg_token_count;
            let latency = point.avg_latency;
            let approximate_cost = point.total_approximate_cost;
            let token_count_point = AnalyticTimeValue {
                time: time.timestamp(),
                value: token_count,
            };
            let latency_point: AnalyticTimeValue = AnalyticTimeValue {
                time: time.timestamp(),
                value: latency,
            };
            let approximate_cost_point = AnalyticTimeValue {
                time: time.timestamp(),
                value: approximate_cost,
            };
            let run_count_point = AnalyticTimeValue {
                time: time.timestamp(),
                value: point.run_count,
            };
            (
                token_count_point,
                (latency_point, (approximate_cost_point, run_count_point)),
            )
        })
        .unzip();
    points.insert("tokenCount".to_string(), token_counts);
    points.insert("latency".to_string(), latencies);
    points.insert("approximateCost".to_string(), approximate_costs);
    points.insert("runCount".to_string(), run_counts);
    points
}
