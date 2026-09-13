use chrono::{DateTime, Utc};
use serde_json::Value;

/// Ser/de `Vec<Uuid>` to/from `Array(UUID)`.
///
/// `clickhouse::serde::uuid` only covers a single `Uuid`, and the crate ships no
/// array equivalent. Without this, `Uuid`'s own `Serialize` runs and RowBinary
/// writes `serialize_bytes` — a varint length plus the 16 bytes, so 17 per
/// element, in the wrong internal order — where ClickHouse expects a bare 16.
///
/// Nothing catches that: `main.rs` sets `.with_validation(false)`, so writes are
/// plain RowBinary with no names or types on the wire. The stream simply
/// desynchronises by one byte per element and the server fails several rows
/// later with `CANNOT_READ_ALL_DATA` ("Bytes read: N. Bytes expected: 8"),
/// pointing at whatever column happened to straddle the end of the buffer. An
/// EMPTY `Vec<Uuid>` serialises correctly either way, so the bug only surfaces
/// once a row actually carries ids.
pub mod uuid_vec {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use uuid::Uuid;

    pub fn serialize<S>(uuids: &[Uuid], serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        if serializer.is_human_readable() {
            uuids
                .iter()
                .map(Uuid::to_string)
                .collect::<Vec<_>>()
                .serialize(serializer)
        } else {
            uuids
                .iter()
                .map(Uuid::as_u64_pair)
                .collect::<Vec<_>>()
                .serialize(serializer)
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<Uuid>, D::Error>
    where
        D: Deserializer<'de>,
    {
        if deserializer.is_human_readable() {
            let raw: Vec<String> = Deserialize::deserialize(deserializer)?;
            raw.into_iter()
                .map(|s| Uuid::parse_str(&s).map_err(serde::de::Error::custom))
                .collect()
        } else {
            let pairs: Vec<(u64, u64)> = Deserialize::deserialize(deserializer)?;
            Ok(pairs
                .into_iter()
                .map(|(hi, lo)| Uuid::from_u64_pair(hi, lo))
                .collect())
        }
    }
}

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
