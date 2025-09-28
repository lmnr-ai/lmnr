use chrono::{DateTime, TimeZone, Utc};

pub fn chrono_to_nanoseconds(chrono_dt: DateTime<Utc>) -> i64 {
    let timestamp = chrono_dt.timestamp(); // seconds since the Unix epoch
    let nanos = chrono_dt.timestamp_subsec_nanos(); // nanoseconds part

    // Convert to a total number of nanoseconds since the Unix epoch
    let total_nanos = (timestamp as i64) * 1_000_000_000 + (nanos as i64);

    total_nanos
}

pub fn nanoseconds_to_chrono(nanos: i64) -> DateTime<Utc> {
    let seconds = nanos / 1_000_000_000;
    let nanos_remainder = (nanos % 1_000_000_000) as u32;
    Utc.timestamp_opt(seconds, nanos_remainder)
        .single()
        .unwrap_or(Utc.timestamp_opt(0, 0).single().unwrap())
}
