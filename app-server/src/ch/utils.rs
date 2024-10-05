use anyhow::Result;
use chrono::{DateTime, Utc};
use clickhouse::Row;
use serde::Deserialize;
use uuid::Uuid;

use crate::db::utils::validate_sql_string;

use super::modifiers::GroupByInterval;

#[derive(Deserialize, Row)]
pub struct TimeBounds {
    pub min_time: i64,
    pub max_time: i64,
}

pub fn chrono_to_nanoseconds(chrono_dt: DateTime<Utc>) -> i64 {
    let timestamp = chrono_dt.timestamp(); // seconds since the Unix epoch
    let nanos = chrono_dt.timestamp_subsec_nanos(); // nanoseconds part

    // Convert to a total number of nanoseconds since the Unix epoch
    let total_nanos = (timestamp as i64) * 1_000_000_000 + (nanos as i64);

    total_nanos
}

pub fn nanoseconds_to_chrono(timestamp_nanos: i64) -> DateTime<Utc> {
    // Create a DateTime<Utc> object from the timestamp in nanoseconds
    DateTime::from_timestamp(
        timestamp_nanos / 1_000_000_000,          // Convert to seconds
        (timestamp_nanos % 1_000_000_000) as u32, // Remaining nanoseconds
    )
    .unwrap_or_else(|| {
        log::error!(
            "Failed to create DateTime<Utc> object from timestamp: {}. Defaulting to current time.",
            timestamp_nanos
        );
        Utc::now()
    })
}

pub fn group_by_time_absolute_statement(
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    group_by_interval: GroupByInterval,
) -> String {
    let ch_round_time = group_by_interval.to_ch_truncate_time();
    let ch_interval = group_by_interval.to_interval();
    let ch_step = group_by_interval.to_ch_step();
    let ch_start_time = start_time.timestamp();
    let ch_end_time = end_time.timestamp();

    format!(
        "GROUP BY
            time
        ORDER BY
            time
        WITH FILL
        FROM {ch_round_time}(fromUnixTimestamp({ch_start_time}))
        TO {ch_round_time}(fromUnixTimestamp({ch_end_time}) + INTERVAL {ch_interval})
        STEP {ch_step}"
    )
}

pub fn group_by_time_relative_statement(
    past_hours: i64,
    group_by_interval: GroupByInterval,
) -> String {
    let ch_round_time = group_by_interval.to_ch_truncate_time();
    let ch_interval = group_by_interval.to_interval();
    let ch_step = group_by_interval.to_ch_step();

    format!(
        "GROUP BY
            time
        ORDER BY
            time
        WITH FILL
        FROM {ch_round_time}(NOW() - INTERVAL {past_hours} HOUR + INTERVAL {ch_interval})
        TO {ch_round_time}(NOW() + INTERVAL {ch_interval})
        STEP {ch_step}"
    )
}

// Template ID is not included here for events, so that all graphs in the event dashboard
// have the same time bounds. If we want to change that logic, we can optionally add
// template_id to the WHERE clause.
async fn get_time_bounds(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    table_name: &str,
    column_name: &str,
) -> Result<TimeBounds> {
    if !validate_sql_string(&table_name) {
        return Err(anyhow::anyhow!("Invalid table name: {}", table_name));
    }
    if !validate_sql_string(&column_name) {
        return Err(anyhow::anyhow!("Invalid column name: {}", column_name));
    }
    let query_string = format!(
        "SELECT
            MIN({column_name}) AS min_time,
            MAX({column_name}) AS max_time
        FROM
            {table_name}
        WHERE project_id = '{project_id}'",
    );

    let mut cursor = clickhouse.query(&query_string).fetch::<TimeBounds>()?;

    let time_bounds = cursor.next().await?.unwrap();
    Ok(time_bounds)
}

pub async fn get_bounds(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    table_name: &str,
    column_name: &str,
) -> Result<(DateTime<Utc>, DateTime<Utc>)> {
    let time_bounds = get_time_bounds(clickhouse, project_id, table_name, column_name).await?;
    Ok((
        nanoseconds_to_chrono(time_bounds.min_time),
        nanoseconds_to_chrono(time_bounds.max_time),
    ))
}

pub async fn execute_query<'de, T>(
    clickhouse: &clickhouse::Client,
    query_string: &str,
) -> Result<Vec<T>>
where
    T: Row + Deserialize<'de>,
{
    let mut cursor = clickhouse.query(query_string).fetch::<T>()?;

    let mut res = Vec::new();
    while let Some(row) = cursor.next().await? {
        res.push(row);
    }

    Ok(res)
}

/// Trivial SQL injection protection
pub fn validate_string_against_injection(s: &str) -> Result<()> {
    let invalid_chars = ["'", "\"", "\\", ";", "*", "/", "--"];
    if invalid_chars.iter().any(|&c| s.contains(c))
        || s.to_lowercase().contains("union")
        || s.to_lowercase().contains("select")
    {
        return Err(anyhow::anyhow!("Invalid characters or SQL keywords"));
    }
    return Ok(());
}
