use rand::distr::{Alphanumeric, SampleString};
use serde_json::Value;
use uuid::Uuid;

pub fn generate_random_key() -> String {
    Alphanumeric.sample_string(&mut rand::rng(), 64)
}

pub fn span_id_to_uuid(span_id: &[u8]) -> Uuid {
    let mut padded_vec = vec![0; 8];
    padded_vec.extend_from_slice(&span_id.to_vec());
    Uuid::from_slice(&padded_vec).unwrap()
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
