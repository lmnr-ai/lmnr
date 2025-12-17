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
