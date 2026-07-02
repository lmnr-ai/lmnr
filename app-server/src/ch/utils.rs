use chrono::{DateTime, Utc};
use serde_json::Value;

pub fn chrono_to_nanoseconds(chrono_dt: DateTime<Utc>) -> i64 {
    let timestamp = chrono_dt.timestamp(); // seconds since the Unix epoch
    let nanos = chrono_dt.timestamp_subsec_nanos(); // nanoseconds part

    // Convert to a total number of nanoseconds since the Unix epoch
    let total_nanos = (timestamp as i64) * 1_000_000_000 + (nanos as i64);

    total_nanos
}

pub fn merge_json_objects(base: Value, incoming: Value) -> Value {
    match (base, incoming) {
        (Value::Object(mut base_map), Value::Object(incoming_map)) => {
            for (k, v) in incoming_map {
                let merged = match base_map.remove(&k) {
                    Some(existing) => merge_json_objects(existing, v),
                    None => v,
                };
                base_map.insert(k, merged);
            }
            Value::Object(base_map)
        }
        (_, incoming) => incoming,
    }
}
