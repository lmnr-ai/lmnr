use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::provider_api_keys::get_provider_api_key_by_name;

/// Provider API key for authentication with AI providers
#[derive(Debug, Clone, Serialize)]
struct ProviderApiKeyPayload {
    name: String,
    nonce: String,
    value: String,
}

/// AI Gateway client for making LLM calls
#[derive(Clone)]
pub struct AIGateway {
    client: reqwest::Client,
    url: String,
    pool: PgPool,
}

impl AIGateway {
    pub fn new(url: String, pool: PgPool) -> Self {
        Self {
            client: reqwest::Client::new(),
            url,
            pool,
        }
    }

    /// Call the AI Gateway with the given request
    /// Automatically fetches provider API key based on model and project
    /// Returns the parsed response content as a Value
    pub async fn call(&self, request: AIGatewayRequest, project_id: Uuid) -> anyhow::Result<Value> {
        // Fetch provider API key based on model
        let provider_api_key = self
            .fetch_provider_api_key(&request.model, project_id)
            .await?;

        // Build the internal request with provider API key
        let internal_request = InternalAIGatewayRequest {
            model: request.model,
            messages: request.messages,
            provider_api_key,
            max_tokens: request.max_tokens,
            temperature: request.temperature,
            structured_output: request.structured_output,
            tools: request.tools,
            tool_choice: request.tool_choice,
            provider_options: request.provider_options,
        };

        let response = self
            .client
            .post(&self.url)
            .header("Content-Type", "application/json")
            .json(&internal_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!(
                "AI Gateway returned error status {}: {}",
                status,
                error_body
            ));
        }

        let gateway_response: AIGatewayResponse = response.json().await?;

        // Extract content from response (handles multiple formats)
        extract_content(&gateway_response)
    }

    /// Extract provider name from model ID and fetch API key
    async fn fetch_provider_api_key(
        &self,
        model_id: &str,
        project_id: Uuid,
    ) -> anyhow::Result<ProviderApiKeyPayload> {
        let key_name = get_provider_api_key_name(model_id);

        match get_provider_api_key_by_name(&self.pool, &key_name, project_id).await? {
            Some(key) => Ok(ProviderApiKeyPayload {
                name: key.name,
                nonce: key.nonce_hex,
                value: key.value,
            }),
            None => {
                log::warn!(
                    "Provider API key '{}' not found for project {}",
                    key_name,
                    project_id
                );
                Err(anyhow::anyhow!(
                    "Provider API key '{}' not found for project {}",
                    key_name,
                    project_id
                ))
            }
        }
    }
}

/// Extract provider name from model ID and convert to API key name
/// e.g., "anthropic:claude-sonnet-4-5" -> "ANTHROPIC_API_KEY"
/// e.g., "openai:gpt-4o" -> "OPENAI_API_KEY"
fn get_provider_api_key_name(model_id: &str) -> String {
    let provider = model_id
        .split(':')
        .next()
        .unwrap_or("openai")
        .to_uppercase();
    format!("{}_API_KEY", provider)
}

/// Request parameters for the AI Gateway (public API)
#[derive(Debug, Default)]
pub struct AIGatewayRequest {
    pub model: String,
    pub messages: Value,
    pub max_tokens: Option<i32>,
    pub temperature: Option<f32>,
    pub structured_output: Option<String>,
    pub tools: Option<String>,
    pub tool_choice: Option<Value>,
    pub provider_options: Option<Value>,
}

/// Internal request sent to AI Gateway (with provider API key)
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InternalAIGatewayRequest {
    model: String,
    messages: Value,
    provider_api_key: ProviderApiKeyPayload,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    structured_output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    provider_options: Option<Value>,
}

/// Response from the AI Gateway
/// Supports two formats:
/// 1. Nested: response.messages[].content[].text
/// 2. Flat: text or object at top level
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AIGatewayResponse {
    /// Direct text response (flat format)
    #[serde(default)]
    pub text: Option<String>,
    /// Parsed structured output object (flat format)
    #[serde(default)]
    pub object: Option<Value>,
    /// Nested response format
    #[serde(default)]
    pub response: Option<AIGatewayResponseBody>,
}

#[derive(Deserialize, Debug)]
pub struct AIGatewayResponseBody {
    #[serde(default)]
    pub messages: Vec<AIGatewayMessage>,
}

#[derive(Deserialize, Debug)]
pub struct AIGatewayMessage {
    #[allow(dead_code)]
    pub role: String,
    pub content: Vec<AIGatewayContentPart>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AIGatewayContentPart {
    #[serde(rename = "type")]
    pub content_type: String,
    #[serde(default)]
    pub text: Option<String>,
}

/// Extract content from AI Gateway response
/// Tries multiple formats in order:
/// 1. object field (structured output)
/// 2. text field (flat format)
/// 3. response.messages (nested format)
fn extract_content(response: &AIGatewayResponse) -> anyhow::Result<Value> {
    // 1. Try structured output object first
    if let Some(ref obj) = response.object {
        return Ok(obj.clone());
    }

    // 2. Try direct text field
    if let Some(ref text) = response.text {
        // Try to parse as JSON, otherwise return as string
        return match serde_json::from_str::<Value>(text) {
            Ok(parsed) => Ok(parsed),
            Err(_) => Ok(Value::String(text.clone())),
        };
    }

    // 3. Try nested response.messages format
    if let Some(ref resp) = response.response {
        if let Some(message) = resp.messages.first() {
            let mut text_parts: Vec<String> = Vec::new();
            for part in &message.content {
                if part.content_type == "text" {
                    if let Some(ref text) = part.text {
                        text_parts.push(text.clone());
                    }
                }
            }
            if !text_parts.is_empty() {
                let text = text_parts.join("");
                return match serde_json::from_str::<Value>(&text) {
                    Ok(parsed) => Ok(parsed),
                    Err(_) => Ok(Value::String(text)),
                };
            }
        }
    }

    Err(anyhow::anyhow!("No content found in AI Gateway response"))
}
