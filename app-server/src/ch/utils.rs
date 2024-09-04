use chrono::{DateTime, Utc};

const ROUND_TO_ZERO_THRESHOLD: f64 = 1e-10;

pub fn round_small_values_to_zero(value: f64) -> f64 {
    if value.abs() < ROUND_TO_ZERO_THRESHOLD {
        0.0
    } else {
        value
    }
}

pub fn chrono_to_timestamp(chrono_dt: DateTime<Utc>) -> i64 {
    let timestamp = chrono_dt.timestamp(); // seconds since the Unix epoch
    let nanos = chrono_dt.timestamp_subsec_nanos(); // nanoseconds part

    // Convert to a total number of nanoseconds since the Unix epoch
    let total_nanos = (timestamp as i64) * 1_000_000_000 + (nanos as i64);

    total_nanos
}

#[allow(deprecated)]
pub fn hours_ago(timestamp_nanos: i64) -> i64 {
    // Create a DateTime<Utc> object from the timestamp in nanoseconds
    let timestamp = DateTime::<Utc>::from_utc(
        chrono::NaiveDateTime::from_timestamp(
            timestamp_nanos / 1_000_000_000,          // Convert to seconds
            (timestamp_nanos % 1_000_000_000) as u32, // Remaining nanoseconds
        ),
        Utc,
    );

    // Get the current time in UTC
    let now = Utc::now();

    // Calculate the difference
    let duration = now.signed_duration_since(timestamp);

    // Convert the duration to hours
    duration.num_hours()
}
