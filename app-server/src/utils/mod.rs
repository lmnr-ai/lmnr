use serde_json::Value;

pub fn json_value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.to_string(),
        Value::Array(a) => a
            .iter()
            .map(json_value_to_string)
            .collect::<Vec<_>>()
            .join(", "),
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
        Value::String(s) => s.len(),
        Value::Array(a) => a.iter().map(estimate_json_size).sum(),
        Value::Object(o) => o.iter().map(|(k, v)| k.len() + estimate_json_size(v)).sum(),
    }
}
