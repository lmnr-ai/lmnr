use rand::distr::{Alphanumeric, SampleString};
use serde_json::Value;
use uuid::Uuid;

const PREVIEW_CHARACTERS: usize = 100;

pub fn generate_random_key() -> String {
    Alphanumeric.sample_string(&mut rand::rng(), 64)
}

pub fn span_id_to_uuid(span_id: &[u8]) -> Uuid {
    let mut padded_vec = vec![0; 8];
    padded_vec.extend_from_slice(&span_id.to_vec());
    Uuid::from_slice(&padded_vec).unwrap()
}

pub fn get_string_preview(value: &Option<Value>) -> Option<String> {
    match value {
        Some(Value::String(s)) => Some(s.chars().take(PREVIEW_CHARACTERS).collect::<String>()),
        Some(v) => Some(
            v.to_string()
                .chars()
                .take(PREVIEW_CHARACTERS)
                .collect::<String>(),
        ),
        None => None,
    }
}
