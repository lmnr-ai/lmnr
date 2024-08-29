use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Number;
use serde_json::Value;
use sqlx::postgres::PgRow;
use sqlx::types::BigDecimal;
use sqlx::{Column, FromRow, PgPool, Postgres, QueryBuilder, Row};
use std::str::FromStr;
use uuid::Uuid;

use super::modifiers::DateRange;

#[derive(FromRow)]
pub struct EventMetricsDatapoint {
    pub time: DateTime<Utc>,
    // Total event count in this interval
    pub count: i64,
}

pub async fn get_event_metrics(
    pool: &PgPool,
    date_range: Option<&DateRange>,
    group_by_interval: &str,
    event_template_id: Uuid,
) -> Result<Vec<EventMetricsDatapoint>> {
    let mut query = match date_range {
        None => {
            // NOTE: Assume this won't happen and frontend is explicit about the date range.
            // Because currently it groups by hour and if the period is too long, it will be too many data points.
            let mut query = QueryBuilder::<Postgres>::new(
                "WITH time_series AS (
            SELECT 
                time_interval
            FROM 
            generate_series(
                COALESCE((SELECT MIN(timestamp) FROM events WHERE template_id = ",
            );
            query
                .push_bind(event_template_id)
                .push("), NOW() - INTERVAL '24 hours'), ");

            query.push(
                "NOW(),
                '1 hour')
            AS time_interval
            )",
            );
            query
        }
        Some(DateRange::Relative(interval)) => QueryBuilder::<Postgres>::new(format!(
            "WITH time_series AS (
                SELECT 
                    time_interval
                FROM 
                generate_series(
                    NOW() - interval '{} hours',
                    NOW(),
                    '1 {}')
                AS time_interval
                )",
            interval.past_hours, group_by_interval
        )),
        Some(DateRange::Absolute(interval)) => {
            let mut query = QueryBuilder::<Postgres>::new(
                "
            WITH time_series AS (
                SELECT 
                    time_interval
                FROM 
                generate_series(
             ",
            );
            query
                .push_bind(interval.start_date)
                .push(", ")
                .push_bind(interval.end_date)
                .push(format!(", '1 {group_by_interval}') AS time_interval)"));
            query
        }
    };

    query.push(", ");
    query.push(format!(
        "data AS (
    SELECT id, timestamp FROM events WHERE template_id = "
    ));
    query.push_bind(event_template_id).push(")");

    query.push(format!("
    SELECT
        date_trunc('{group_by_interval}', time_series.time_interval) as time,
        COUNT(distinct(data.id))::int8 as count
    FROM time_series
    LEFT JOIN data on date_trunc('{group_by_interval}', data.timestamp) = date_trunc('{group_by_interval}', time_series.time_interval)
    GROUP BY time ORDER BY time ASC"));

    let res = query
        .build_query_as::<'_, EventMetricsDatapoint>()
        .fetch_all(pool)
        .await?;

    Ok(res)
}

#[derive(Deserialize)]
pub enum MetricGroupBy {
    Total,
    Average,
}

impl MetricGroupBy {
    pub fn to_capitalized_str(&self) -> &str {
        match self {
            MetricGroupBy::Total => "Total",
            MetricGroupBy::Average => "Average",
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Metric {
    /// e.g. "traceCount", "traceLatency", "tokenCount", "approximateCost"
    pub metric: String,
    pub group_by: MetricGroupBy,
}

#[derive(Debug)]
pub struct TraceMetricValue(pub Value);

pub fn to_f64_number_column_value(row: &PgRow, column_name: &str) -> Result<Value, sqlx::Error> {
    row.try_get::<Option<BigDecimal>, _>(column_name)
        .map(|value| match value {
            Some(v) => {
                let value_str = v.to_string();
                Value::Number(Number::from_f64(f64::from_str(&value_str).unwrap()).unwrap())
            }
            None => Value::Null,
        })
}

impl<'r> FromRow<'r, PgRow> for TraceMetricValue {
    fn from_row(row: &'r PgRow) -> Result<Self, sqlx::Error> {
        let mut map = serde_json::Map::new();

        for column in row.columns() {
            let column_name = column.name();
            let camel_case_name = snake_to_camel_case(column_name);
            let column_value = match column_name {
                "time" => row
                    .try_get::<DateTime<Utc>, _>(column_name)
                    .map(|value| Value::Number(value.timestamp().into())),
                "trace_count_total" => {
                    row.try_get::<Option<i64>, _>(column_name)
                        .map(|value| match value {
                            Some(v) => Value::Number(Number::from(v)),
                            None => Value::Null,
                        })
                }
                _ => to_f64_number_column_value(row, column_name),
            };

            match column_value {
                Ok(value) => {
                    map.insert(camel_case_name, value);
                }
                Err(err) => {
                    return Err(sqlx::Error::ColumnDecode {
                        index: column_name.to_string(),
                        source: Box::new(err),
                    });
                }
            }
        }

        Ok(TraceMetricValue(Value::Object(map)))
    }
}

/// Get trace metric column
///
/// NOTE: It's problematic to use upper_case letters in column names in SQL queries.
/// So, we use snake_case here and convert it to camelCase later.
fn get_trace_metric_column(metric: &Metric) -> Result<(String, String)> {
    match metric.metric.as_str() {
        "traceCount" => match metric.group_by {
            MetricGroupBy::Total => Ok((
                String::from("id"),
                String::from("COUNT(distinct(data.id))::int8 as trace_count_total"),
            )),
            MetricGroupBy::Average => Err(anyhow::anyhow!(
                "Average grouping is not supported for traceCount metric"
            )),
        },
        "traceLatencySeconds" => match metric.group_by {
            MetricGroupBy::Total => Err(anyhow::anyhow!(
                "Total grouping is not supported for traceLatency metric"
            )),
            MetricGroupBy::Average => Ok((
                String::from("(end_time - start_time) as duration"),
                String::from(
                    "COALESCE(AVG(EXTRACT(EPOCH FROM data.duration)), 0)::numeric as trace_latency_seconds_average",
                ),
            )),
        },
        "totalTokenCount" => match metric.group_by {
            MetricGroupBy::Total => Ok((
                String::from("total_token_count"),
                // total_token_count_total is the total over the totals of all traces
                String::from("COALESCE(SUM(data.total_token_count), 0)::numeric as total_token_count_total"),
            )),
            MetricGroupBy::Average => Ok((
                String::from("total_token_count"),
                String::from(
                    "COALESCE(AVG(data.total_token_count), 0)::numeric as total_token_count_average",
                ),
            )),
        },
        "costUsd" => match metric.group_by {
            MetricGroupBy::Total => Ok((
                String::from("cost"),
                String::from("COALESCE(SUM(data.cost), 0)::numeric as cost_usd_total"),
            )),
            MetricGroupBy::Average => Ok((
                String::from("cost"),
                String::from("COALESCE(AVG(data.cost), 0)::numeric as cost_usd_average"),
            )),
        },
        _ => {
            return Err(anyhow::anyhow!("Unsupported metric: {}", metric.metric));
        }
    }
}

pub async fn get_trace_metrics(
    pool: &PgPool,
    metrics: &Vec<Metric>,
    date_range: Option<&DateRange>,
    group_by_interval: &str,
    project_id: Uuid,
) -> Result<Vec<TraceMetricValue>> {
    let mut column_names = Vec::new();
    let mut grouped_columns = Vec::new();
    for metric in metrics {
        let (column_name, grouped_column) = get_trace_metric_column(metric)?;
        column_names.push(column_name);
        grouped_columns.push(grouped_column);
    }

    let mut query = match date_range {
        None => {
            // NOTE: Assume this won't happen and frontend is explicit about the date range.
            // Because currently it groups by hour and if the period is too long, it will be too many data points.
            let mut query = QueryBuilder::<Postgres>::new(
                "WITH time_series AS (
            SELECT 
                time_interval
            FROM 
            generate_series(
                COALESCE((SELECT MIN(start_time) FROM new_traces WHERE project_id = ",
            );
            query
                .push_bind(project_id)
                .push("), NOW() - INTERVAL '24 hours'), ");

            query.push(
                "NOW(),
                '1 hour')
            AS time_interval
            )",
            );
            query
        }
        Some(DateRange::Relative(interval)) => QueryBuilder::<Postgres>::new(format!(
            "WITH time_series AS (
                SELECT 
                    time_interval
                FROM 
                generate_series(
                    NOW() - interval '{} hours',
                    NOW(),
                    '1 {}')
                AS time_interval
                )",
            interval.past_hours, group_by_interval
        )),
        Some(DateRange::Absolute(interval)) => {
            let mut query = QueryBuilder::<Postgres>::new(
                "
            WITH time_series AS (
                SELECT 
                    time_interval
                FROM 
                generate_series(
             ",
            );
            query
                .push_bind(interval.start_date)
                .push(", ")
                .push_bind(interval.end_date)
                .push(format!(", '1 {group_by_interval}') AS time_interval)"));
            query
        }
    };

    query.push(", ");
    query.push(format!("data AS (SELECT end_time, "));

    query.push(&column_names.join(", "));

    query.push(
        " FROM new_traces WHERE start_time IS NOT NULL AND end_time IS NOT NULL AND project_id = ",
    );
    query.push_bind(project_id).push(")");

    query.push(format!(
        "
    SELECT
        date_trunc('{group_by_interval}', time_series.time_interval) as time, "
    ));

    query.push(&grouped_columns.join(", "));

    query.push(format!(" FROM time_series
    LEFT JOIN data on date_trunc('{group_by_interval}', data.end_time) = date_trunc('{group_by_interval}', time_series.time_interval)
    GROUP BY time ORDER BY time ASC"));

    let res = query
        .build_query_as::<'_, TraceMetricValue>()
        .fetch_all(pool)
        .await?;

    Ok(res)
}

// Helper function to convert snake_case to camelCase
fn snake_to_camel_case(s: &str) -> String {
    let mut result = String::new();
    let mut capitalize_next = false;

    for c in s.chars() {
        if c == '_' {
            capitalize_next = true;
        } else if capitalize_next {
            result.push(c.to_ascii_uppercase());
            capitalize_next = false;
        } else {
            result.push(c);
        }
    }

    result
}
