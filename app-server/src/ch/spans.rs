use anyhow::Result;
use chrono::{DateTime, Utc};
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{db, traces::SpanUsage};

use super::{
    modifiers::GroupByInterval,
    utils::{
        chrono_to_nanoseconds, execute_query, group_by_time_absolute_statement,
        group_by_time_relative_statement,
    },
    Aggregation, MetricTimeValue,
};

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
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
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
    pub fn from_db_span(span: &db::trace::Span, usage: SpanUsage, project_id: Uuid) -> Self {
        let span_attributes = span.get_attributes();

        CHSpan {
            span_id: span.span_id,
            name: span.name.clone(),
            span_type: span.span_type.clone().into(),
            start_time: chrono_to_nanoseconds(span.start_time),
            end_time: chrono_to_nanoseconds(span.end_time),
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
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
    let ch_round_time = group_by_interval.to_ch_truncate_time();

    let query_string = format!(
        "
    WITH traces AS (
        SELECT
            trace_id,
            project_id,
            {ch_round_time}(MIN(start_time)) as time
        FROM spans
        GROUP BY project_id, trace_id
    )
    SELECT
        time,
        COUNT(DISTINCT(trace_id)) as value
    FROM traces
    WHERE
        project_id = '{project_id}'
        AND time >= now() - INTERVAL {past_hours} HOUR
    {}",
        group_by_time_relative_statement(past_hours, group_by_interval)
    );

    execute_query(&clickhouse, &query_string).await
}

pub async fn get_total_trace_count_metrics_absolute(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
) -> Result<Vec<MetricTimeValue<i64>>> {
    let ch_round_time = group_by_interval.to_ch_truncate_time();
    let ch_start_time = start_time.timestamp();
    let ch_end_time = end_time.timestamp();

    let query_string = format!(
        "
    WITH traces AS (
    SELECT
        trace_id,
        project_id,
        {ch_round_time}(MIN(start_time)) as time,
        SUM(total_tokens) as value
    FROM spans
    GROUP BY project_id, trace_id
    )
    SELECT
        time,
        COUNT(DISTINCT(trace_id)) as value
    FROM traces
    WHERE
        project_id = '{project_id}'
        AND time >= fromUnixTimestamp({ch_start_time})
        AND time <= fromUnixTimestamp({ch_end_time})
    {}",
        group_by_time_absolute_statement(start_time, end_time, group_by_interval)
    );

    execute_query(&clickhouse, &query_string).await
}

pub async fn get_trace_latency_seconds_metrics_relative(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    past_hours: i64,
    aggregation: Aggregation,
) -> Result<Vec<MetricTimeValue<f64>>> {
    let query_string = span_metric_query_relative(
        project_id,
        group_by_interval,
        past_hours,
        aggregation,
        "(toUnixTimestamp64Nano(MAX(end_time)) - toUnixTimestamp64Nano(MIN(start_time))) / 1e9",
    );

    execute_query(&clickhouse, &query_string).await
}

pub async fn get_trace_latency_seconds_metrics_absolute(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    aggregation: Aggregation,
) -> Result<Vec<MetricTimeValue<f64>>> {
    let query_string = span_metric_query_absolute(
        project_id,
        group_by_interval,
        start_time,
        end_time,
        aggregation,
        "(toUnixTimestamp64Nano(MAX(end_time)) - toUnixTimestamp64Nano(MIN(start_time))) / 1e9",
    );

    execute_query(&clickhouse, &query_string).await
}

pub async fn get_total_token_count_metrics_relative(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    past_hours: i64,
    aggregation: Aggregation,
) -> Result<Vec<MetricTimeValue<i64>>> {
    let query_string = span_metric_query_relative(
        project_id,
        group_by_interval,
        past_hours,
        aggregation,
        "SUM(total_tokens)",
    );

    let mut cursor = clickhouse
        .query(&query_string)
        .fetch::<MetricTimeValue<i64>>()?;

    let mut res = Vec::new();
    while let Some(row) = cursor.next().await? {
        res.push(row);
    }

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
    let query_string = span_metric_query_absolute(
        project_id,
        group_by_interval,
        start_time,
        end_time,
        aggregation,
        "SUM(total_tokens)",
    );

    execute_query(&clickhouse, &query_string).await
}

pub async fn get_cost_usd_metrics_relative(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    past_hours: i64,
    aggregation: Aggregation,
) -> Result<Vec<MetricTimeValue<f64>>> {
    let query_string = span_metric_query_relative(
        project_id,
        group_by_interval,
        past_hours,
        aggregation,
        "SUM(total_cost)",
    );

    execute_query(&clickhouse, &query_string).await
}

pub async fn get_cost_usd_metrics_absolute(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    aggregation: Aggregation,
) -> Result<Vec<MetricTimeValue<f64>>> {
    let query_string = span_metric_query_absolute(
        project_id,
        group_by_interval,
        start_time,
        end_time,
        aggregation,
        "SUM(total_cost)",
    );

    execute_query(&clickhouse, &query_string).await
}

fn span_metric_query_relative(
    project_id: Uuid,
    group_by_interval: GroupByInterval,
    past_hours: i64,
    aggregation: Aggregation,
    metric: &str,
) -> String {
    let ch_round_time = group_by_interval.to_ch_truncate_time();
    let ch_aggregation = aggregation.to_ch_agg_function();

    format!(
        "
    WITH traces AS (
    SELECT
        trace_id,
        project_id,
        {ch_round_time}(MIN(start_time)) as time,
        {metric} as value
    FROM spans
    GROUP BY project_id, trace_id
    )
    SELECT
        time,
        {ch_aggregation}(value) as value
    FROM traces
    WHERE
        project_id = '{project_id}'
        AND time >= now() - INTERVAL {past_hours} HOUR
    {}",
        group_by_time_relative_statement(past_hours, group_by_interval)
    )
}

fn span_metric_query_absolute(
    project_id: Uuid,
    group_by_interval: GroupByInterval,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    aggregation: Aggregation,
    metric: &str,
) -> String {
    let ch_round_time = group_by_interval.to_ch_truncate_time();
    let ch_start_time = start_time.timestamp();
    let ch_end_time = end_time.timestamp();
    let ch_aggregation = aggregation.to_ch_agg_function();

    format!(
        "
    WITH traces AS (
    SELECT
        trace_id,
        project_id,
        {ch_round_time}(MIN(start_time)) as time,
        {metric} as value
    FROM spans
    GROUP BY project_id, trace_id
    )
    SELECT
        time,
        {ch_aggregation}(value) as value
    FROM traces
    WHERE
        project_id = '{project_id}'
        AND time >= fromUnixTimestamp({ch_start_time})
        AND time <= fromUnixTimestamp({ch_end_time})
    {}",
        group_by_time_absolute_statement(start_time, end_time, group_by_interval)
    )
}
