use anyhow::Result;
use chrono::{DateTime, Utc};
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::spans::{Span, SpanType},
    features::{is_feature_enabled, Feature},
    traces::spans::SpanUsage,
};

use super::{
    modifiers::GroupByInterval,
    utils::{
        chrono_to_nanoseconds, group_by_time_absolute_statement, group_by_time_relative_statement,
    },
    Aggregation, MetricTimeValue,
};

/// for inserting into clickhouse
///
/// Don't change the order of the fields or their values
impl Into<u8> for SpanType {
    fn into(self) -> u8 {
        match self {
            SpanType::DEFAULT => 0,
            SpanType::LLM => 1,
            SpanType::PIPELINE => 2,
            SpanType::EXECUTOR => 3,
            SpanType::EVALUATOR => 4,
            SpanType::EVALUATION => 5,
        }
    }
}

#[derive(Row, Serialize, Deserialize)]
pub struct CHSpan {
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    pub name: String,
    pub span_type: u8,
    /// Start time in nanoseconds
    pub start_time: i64,
    /// End time in nanoseconds
    pub end_time: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
    pub model: String,
    pub session_id: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub provider: String,
    pub user_id: String,
    // Default value is <null>  backwards compatibility or if path attribute is not present
    pub path: String,
}

impl CHSpan {
    pub fn from_db_span(span: &Span, usage: SpanUsage, project_id: Uuid) -> Self {
        let span_attributes = span.get_attributes();

        CHSpan {
            span_id: span.span_id,
            name: span.name.clone(),
            span_type: span.span_type.clone().into(),
            start_time: chrono_to_nanoseconds(span.start_time),
            end_time: chrono_to_nanoseconds(span.end_time),
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            total_tokens: usage.total_tokens,
            input_cost: usage.input_cost,
            output_cost: usage.output_cost,
            total_cost: usage.total_cost,
            model: usage
                .response_model
                .or(usage.request_model)
                .unwrap_or(String::from("<null>")),
            session_id: span_attributes
                .session_id()
                .unwrap_or(String::from("<null>")),
            project_id: project_id,
            trace_id: span.trace_id,
            provider: usage.provider_name.unwrap_or(String::from("<null>")),
            user_id: span_attributes.user_id().unwrap_or(String::from("<null>")),
            path: span_attributes.path().unwrap_or(String::from("<null>")),
        }
    }
}

pub async fn insert_span(clickhouse: clickhouse::Client, span: &CHSpan) -> Result<()> {
    if !is_feature_enabled(Feature::FullBuild) {
        return Ok(());
    }
    let ch_insert = clickhouse.insert("spans");
    match ch_insert {
        Ok(mut ch_insert) => {
            ch_insert.write(span).await?;
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => {
                    return Err(anyhow::anyhow!("Clickhouse span insertion failed: {:?}", e));
                }
            }
        }
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Failed to insert span into Clickhouse: {:?}",
                e
            ));
        }
    }
}

pub async fn get_total_trace_count_metrics_relative(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    past_hours: i64,
) -> Result<Vec<MetricTimeValue<i64>>> {
    let query = trace_metric_query_relative(
        &clickhouse,
        project_id,
        group_by_interval,
        past_hours,
        Aggregation::Total,
        "COUNT(DISTINCT(trace_id))",
    );

    let rows = query.fetch_all().await?;

    Ok(rows)
}

pub async fn get_total_trace_count_metrics_absolute(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    aggregation: Aggregation,
) -> Result<Vec<MetricTimeValue<i64>>> {
    let query = trace_metric_query_absolute(
        &clickhouse,
        project_id,
        group_by_interval,
        start_time,
        end_time,
        aggregation,
        "COUNT(DISTINCT(trace_id))",
    );

    let rows = query.fetch_all().await?;

    Ok(rows)
}

pub async fn get_trace_latency_seconds_metrics_relative(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    past_hours: i64,
    aggregation: Aggregation,
) -> Result<Vec<MetricTimeValue<f64>>> {
    let query = trace_metric_query_relative(
        &clickhouse,
        project_id,
        group_by_interval,
        past_hours,
        aggregation,
        "(toUnixTimestamp64Nano(MAX(end_time)) - toUnixTimestamp64Nano(MIN(start_time))) / 1e9",
    );

    let res = query.fetch_all::<MetricTimeValue<f64>>().await?;

    Ok(res)
}

pub async fn get_trace_latency_seconds_metrics_absolute(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    aggregation: Aggregation,
) -> Result<Vec<MetricTimeValue<f64>>> {
    let query = trace_metric_query_absolute(
        &clickhouse,
        project_id,
        group_by_interval,
        start_time,
        end_time,
        aggregation,
        "(toUnixTimestamp64Nano(MAX(end_time)) - toUnixTimestamp64Nano(MIN(start_time))) / 1e9",
    );

    let res = query.fetch_all::<MetricTimeValue<f64>>().await?;

    Ok(res)
}

pub async fn get_total_token_count_metrics_relative(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    past_hours: i64,
    aggregation: Aggregation,
) -> Result<Vec<MetricTimeValue<i64>>> {
    let query = trace_metric_query_relative(
        &clickhouse,
        project_id,
        group_by_interval,
        past_hours,
        aggregation,
        "SUM(total_tokens)",
    );

    let res = query.fetch_all::<MetricTimeValue<i64>>().await?;

    Ok(res)
}

pub async fn get_total_token_count_metrics_absolute(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    aggregation: Aggregation,
) -> Result<Vec<MetricTimeValue<i64>>> {
    let query = trace_metric_query_absolute(
        &clickhouse,
        project_id,
        group_by_interval,
        start_time,
        end_time,
        aggregation,
        "SUM(total_tokens)",
    );

    let res = query.fetch_all().await?;

    Ok(res)
}

pub async fn get_cost_usd_metrics_relative(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    past_hours: i64,
    aggregation: Aggregation,
) -> Result<Vec<MetricTimeValue<f64>>> {
    let query = trace_metric_query_relative(
        &clickhouse,
        project_id,
        group_by_interval,
        past_hours,
        aggregation,
        "SUM(total_cost)",
    );

    let res = query.fetch_all().await?;

    Ok(res)
}

pub async fn get_cost_usd_metrics_absolute(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    aggregation: Aggregation,
) -> Result<Vec<MetricTimeValue<f64>>> {
    let query = trace_metric_query_absolute(
        &clickhouse,
        project_id,
        group_by_interval,
        start_time,
        end_time,
        aggregation,
        "SUM(total_cost)",
    );

    let res = query.fetch_all().await?;

    Ok(res)
}

fn trace_metric_query_relative(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    group_by_interval: GroupByInterval,
    past_hours: i64,
    aggregation: Aggregation,
    metric: &str,
) -> clickhouse::query::Query {
    let ch_round_time = group_by_interval.to_ch_truncate_time();
    let ch_aggregation = aggregation.to_ch_agg_function();
    let types: Vec<u8> = vec![SpanType::DEFAULT.into(), SpanType::LLM.into()];

    let query_string = format!(
        "
    WITH traces AS (
    SELECT
        trace_id,
        project_id,
        {ch_round_time}(MIN(start_time)) as time,
        {metric} as value
    FROM spans
    WHERE span_type in ?
    GROUP BY project_id, trace_id
    )
    SELECT
        time,
        {ch_aggregation}(value) as value
    FROM traces
    WHERE
        project_id = ?
        AND time >= now() - INTERVAL ? HOUR
    {}",
        group_by_time_relative_statement(past_hours, group_by_interval)
    );

    clickhouse
        .query(&query_string)
        .bind(types)
        .bind(project_id)
        .bind(past_hours)
}

fn trace_metric_query_absolute(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    group_by_interval: GroupByInterval,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    aggregation: Aggregation,
    metric: &str,
) -> clickhouse::query::Query {
    let ch_round_time = group_by_interval.to_ch_truncate_time();
    let ch_start_time = start_time.timestamp();
    let ch_end_time = end_time.timestamp();
    let ch_aggregation = aggregation.to_ch_agg_function();
    let types: Vec<u8> = vec![SpanType::DEFAULT.into(), SpanType::LLM.into()];

    let query_string = format!(
        "
    WITH traces AS (
    SELECT
        trace_id,
        project_id,
        {ch_round_time}(MIN(start_time)) as time,
        {metric} as value
    FROM spans
    WHERE span_type in ?
    GROUP BY project_id, trace_id
    )
    SELECT
        time,
        {ch_aggregation}(value) as value
    FROM traces
    WHERE
        project_id = ?
        AND time >= fromUnixTimestamp(?)
        AND time <= fromUnixTimestamp(?)
    {}",
        group_by_time_absolute_statement(start_time, end_time, group_by_interval)
    );

    clickhouse
        .query(&query_string)
        .bind(types)
        .bind(project_id)
        .bind(ch_start_time)
        .bind(ch_end_time)
}
