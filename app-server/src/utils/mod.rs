use backoff::ExponentialBackoffBuilder;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::time::Duration;

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

pub fn sanitize_string(input: &str) -> String {
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

/// Call an HTTP service with retry logic using exponential backoff
/// Returns the deserialized response on success
pub async fn call_service_with_retry<T>(
    client: &reqwest::Client,
    service_url: &str,
    auth_token: &str,
    request_body: &Value,
) -> anyhow::Result<T>
where
    T: DeserializeOwned,
{
    let call_service = || async {
        let response = client
            .post(service_url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .header("Content-Type", "application/json")
            .json(request_body)
            .send()
            .await
            .map_err(|e| {
                log::warn!("Failed to call service ({}): {:?}", service_url, e);
                backoff::Error::transient(anyhow::Error::from(e))
            })?;

        if response.status().is_success() {
            let response_text = response.text().await.unwrap_or_default();
            log::debug!("Service response ({}): {}", service_url, response_text);

            serde_json::from_str(&response_text).map_err(|e| {
                log::error!(
                    "Failed to deserialize response from {}: {:?}",
                    service_url,
                    e
                );
                backoff::Error::permanent(anyhow::Error::from(e))
            })
        } else {
            let status = response.status();
            let response_text = response.text().await.unwrap_or_default();
            log::warn!(
                "Service returned error status {}, Response: {}",
                status,
                response_text
            );
            Err(backoff::Error::transient(anyhow::anyhow!(
                "Service error: {}, Response: {}",
                status,
                response_text
            )))
        }
    };

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(Duration::from_millis(1000))
        .with_max_interval(Duration::from_secs(30))
        .with_max_elapsed_time(Some(Duration::from_secs(60))) // 1 minute max
        .build();

    backoff::future::retry(backoff, call_service)
        .await
        .map_err(Into::into)
}

/// Render mustache-style template with JSON object attributes
/// Example: "{{input}}" with attributes {"input": "hello"} -> "hello"
pub fn render_mustache_template(template: &str, attributes: &Value) -> anyhow::Result<String> {
    if !attributes.is_object() {
        return Err(anyhow::anyhow!("Attributes must be a JSON object"));
    }

    let mut result = template.to_string();

    // Simple mustache-style template rendering
    // Find all {{key}} patterns and replace with corresponding values from attributes
    let re = regex::Regex::new(r"\{\{(\w+)\}\}").unwrap();

    for cap in re.captures_iter(template) {
        let key = &cap[1];
        let placeholder = &cap[0];

        if let Some(value) = attributes.get(key) {
            let replacement = match value {
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                Value::Bool(b) => b.to_string(),
                Value::Null => String::new(),
                // For complex types, use JSON representation
                _ => serde_json::to_string(value).unwrap_or_default(),
            };
            result = result.replace(placeholder, &replacement);
        } else {
            log::warn!("Template key '{}' not found in attributes", key);
            // Leave placeholder as-is if key not found
        }
    }

    Ok(result)
}
