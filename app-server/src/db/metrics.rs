use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};
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
pub enum Aggregation {
    Total,
    Average,
}
