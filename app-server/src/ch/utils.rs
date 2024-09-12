use chrono::{DateTime, Utc};
use clickhouse::Row;
use serde::Deserialize;

const ROUND_TO_ZERO_THRESHOLD: f64 = 1e-10;

#[derive(Deserialize, Row)]
pub struct TimeBounds {
    pub min_time: i64,
    pub max_time: i64,
}

pub fn round_small_values_to_zero(value: f64) -> f64 {
    if value.abs() < ROUND_TO_ZERO_THRESHOLD {
        0.0
    } else {
        value
    }
}

pub fn chrono_to_nanoseconds(chrono_dt: DateTime<Utc>) -> i64 {
    let timestamp = chrono_dt.timestamp(); // seconds since the Unix epoch
    let nanos = chrono_dt.timestamp_subsec_nanos(); // nanoseconds part

    // Convert to a total number of nanoseconds since the Unix epoch
    let total_nanos = (timestamp as i64) * 1_000_000_000 + (nanos as i64);

    total_nanos
}

pub fn hours_ago(timestamp_nanos: i64) -> i64 {
    // Create a DateTime<Utc> object from the timestamp in nanoseconds
    let timestamp = DateTime::from_timestamp(
        timestamp_nanos / 1_000_000_000,          // Convert to seconds
        (timestamp_nanos % 1_000_000_000) as u32, // Remaining nanoseconds
    )
    .unwrap_or_else(|| {
        log::error!(
            "Failed to create DateTime<Utc> object from timestamp: {}. Defaulting to current time.",
            timestamp_nanos
        );
        Utc::now()
    });

    // Get the current time in UTC
    let now = Utc::now();

    // Calculate the difference
    let duration = now.signed_duration_since(timestamp);

    // Convert the duration to hours
    duration.num_hours()
}
