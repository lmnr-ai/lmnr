use serde_json::Value;

/// Extract text content from a JSON value for searchability.
/// Recursively extracts all string values and keys, avoiding double-encoding.
pub fn extract_text_from_json_value(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Object(obj) => {
            let mut parts = Vec::new();
            for (key, val) in obj {
                parts.push(key.clone());
                parts.push(extract_text_from_json_value(val));
            }
            parts.join(" ")
        }
        Value::Array(arr) => arr
            .iter()
            .map(extract_text_from_json_value)
            .collect::<Vec<_>>()
            .join(" "),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => String::new(),
    }
}

/// Apply `preprocess_text` to every string leaf in a JSON value in place.
/// Used to clean signal-event payloads before they reach Quickwit while
/// preserving the JSON structure (so each subfield's positions stay
/// independent for phrase-query scoping).
pub fn preprocess_json_strings(value: &mut Value) {
    match value {
        Value::String(s) => *s = crate::quickwit::preprocess::preprocess_text(s),
        Value::Object(map) => map.values_mut().for_each(preprocess_json_strings),
        Value::Array(arr) => arr.iter_mut().for_each(preprocess_json_strings),
        _ => {}
    }
}
