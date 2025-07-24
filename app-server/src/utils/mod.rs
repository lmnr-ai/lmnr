use serde_json::Value;

pub fn json_value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.to_string(),
        _ => v.to_string(),
    }
}

/// Estimate the size of a JSON value in bytes.
/// Ignores the quotes, commas, colons, and braces.
pub fn estimate_json_size(v: &Value) -> usize {
    match v {
        Value::Null => 4,
        Value::Bool(b) => b.to_string().len(),
        Value::Number(n) => n.to_string().len(),
        Value::String(s) => s.as_bytes().len(),
        Value::Array(a) => a.iter().map(estimate_json_size).sum(),
        Value::Object(o) => o.iter().map(|(k, v)| k.len() + estimate_json_size(v)).sum(),
    }
}

/// Check if a string is a URL (http, https, or data URL)
pub fn is_url(data: &str) -> bool {
    data.starts_with("http://") || data.starts_with("https://") || data.starts_with("data:")
}
