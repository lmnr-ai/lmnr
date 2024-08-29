use std::collections::HashMap;

use actix_web::{post, web, HttpResponse};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    db::{
        self,
        metrics::{Metric, TraceMetricValue},
        modifiers::{DateRange, GroupByInterval},
        DB,
    },
    routes::ResponseResult,
};

use super::trace_analytics::AnalyticTimeValue;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetTraceMetricsParams {
    metrics: Vec<Metric>,
    /// Date range per page
    #[serde(default)]
    #[serde(flatten)]
    pub date_range: Option<DateRange>,
    /// Group by interval per page
    #[serde(default)]
    pub group_by_interval: GroupByInterval,
}

#[post("traces/metrics")]
pub async fn get_traces_metrics(
    params: web::Path<Uuid>,
    db: web::Data<DB>,
    req: web::Json<GetTraceMetricsParams>,
) -> ResponseResult {
    let project_id = params.into_inner();
    let req = req.into_inner();
    let metrics = req.metrics;
    let date_range = req.date_range;

    let values = db::metrics::get_trace_metrics(
        &db.pool,
        &metrics,
        date_range.as_ref(),
        req.group_by_interval.to_sql(),
        project_id,
    )
    .await?;

    Ok(HttpResponse::Ok().json(convert_trace_metrics_response(metrics, &values)))
}

fn convert_trace_metrics_response(
    metrics: Vec<Metric>,
    db_datapoints: &Vec<TraceMetricValue>,
) -> HashMap<String, Vec<AnalyticTimeValue>> {
    let mut points = HashMap::<String, Vec<AnalyticTimeValue>>::new();

    let obj_datapoints: Vec<_> = db_datapoints
        .into_iter()
        .map(|p| {
            let p = &p.0;
            match p {
                Value::Object(obj) => obj,
                _ => panic!("Expected object value"),
            }
        })
        .collect();

    for metric in metrics.into_iter() {
        let mut values = vec![];
        let metric_key = format!("{}{}", metric.metric, metric.group_by.to_capitalized_str()); // camelCase

        for dp in obj_datapoints.iter() {
            let time = dp["time"].as_i64().unwrap();
            let value = dp[&metric_key].as_f64();

            values.push(AnalyticTimeValue { time, value });
        }

        points.insert(metric_key, values);
    }

    points
}
