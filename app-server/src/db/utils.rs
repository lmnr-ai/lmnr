use std::str::FromStr;

use rand::distributions::{Alphanumeric, DistString};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::opentelemetry::opentelemetry_proto_common_v1;

pub fn generate_random_key() -> String {
    Alphanumeric.sample_string(&mut rand::thread_rng(), 64)
}

pub fn convert_any_value_to_json_value(
    any_value: Option<opentelemetry_proto_common_v1::AnyValue>,
) -> serde_json::Value {
    match any_value.unwrap().value.unwrap() {
        opentelemetry_proto_common_v1::any_value::Value::StringValue(val) => {
            let mut val = val;

            // this is a workaround for cases when json.dumps equivalent is applied multiple times to the same value
            while let Ok(serde_json::Value::String(v)) =
                serde_json::from_str::<serde_json::Value>(&val)
            {
                val = v;
            }

            serde_json::Value::String(val)
        }
        opentelemetry_proto_common_v1::any_value::Value::BoolValue(val) => {
            serde_json::Value::Bool(val)
        }
        opentelemetry_proto_common_v1::any_value::Value::IntValue(val) => json!(val),
        opentelemetry_proto_common_v1::any_value::Value::DoubleValue(val) => {
            serde_json::Value::Number(serde_json::Number::from_f64(val).unwrap())
        }
        opentelemetry_proto_common_v1::any_value::Value::ArrayValue(val) => {
            let values: Vec<serde_json::Value> = val
                .values
                .into_iter()
                .map(|v| convert_any_value_to_json_value(Some(v)))
                .collect();
            json!(values)
        }
        opentelemetry_proto_common_v1::any_value::Value::KvlistValue(val) => {
            let map: serde_json::Map<String, serde_json::Value> = val
                .values
                .into_iter()
                .map(|kv| {
                    (
                        kv.key,
                        convert_any_value_to_json_value(Some(kv.value.unwrap())),
                    )
                })
                .collect();
            json!(map)
        }
        opentelemetry_proto_common_v1::any_value::Value::BytesValue(val) => {
            serde_json::Value::from_str(String::from_utf8(val).unwrap().as_str()).unwrap()
        }
    }
}

pub fn span_id_to_uuid(span_id: &[u8]) -> Uuid {
    let mut padded_vec = vec![0; 8];
    padded_vec.extend_from_slice(&span_id.to_vec());
    Uuid::from_slice(&padded_vec).unwrap()
}

pub fn validate_sql_string(s: &str) -> bool {
    s.chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '.')
}

pub fn sanitize_string_for_postgres(input: &str) -> String {
    // Remove Unicode null characters and invalid UTF-8 sequences
    input
        .chars()
        .filter(|&c| {
            // Keep newlines and tabs, remove other control chars
            if c == '\n' || c == '\t' {
                return true;
            }
            // Remove Unicode null characters
            if c == '\0' || c == '\u{0000}' || c == '\u{FFFE}' || c == '\u{FFFF}' {
                return false;
            }
            // Remove other control characters
            if c.is_control() {
                return false;
            }
            true
        })
        .collect::<String>()
}

pub fn sanitize_value(v: &Value) -> Value {
    match v {
        Value::String(s) => Value::String(sanitize_string_for_postgres(s)),
        Value::Array(arr) => Value::Array(arr.iter().map(sanitize_value).collect()),
        Value::Object(obj) => Value::Object(
            obj.iter()
                .map(|(k, v)| (sanitize_string_for_postgres(k), sanitize_value(v)))
                .collect(),
        ),
        _ => v.clone(),
    }
}
