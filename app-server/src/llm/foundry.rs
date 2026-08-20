#![cfg_attr(not(feature = "signals"), allow(dead_code))]

//! Claude on Microsoft Foundry (Azure). Foundry serves Anthropic models on the
//! native Messages API at `{endpoint}/anthropic/v1/messages` — the
//! OpenAI-compatible route the `azure` provider uses 404s on a Claude
//! deployment — so the wire format here is Bedrock's InvokeModel body, which is
//! the Anthropic Messages body, sent over plain HTTP.

use std::convert::Infallible;
use std::time::Duration;

use serde_json::Value;
use thiserror::Error;
use tokio::sync::mpsc::UnboundedSender;

use crate::env;
use crate::llm::{
    LanguageModelClient, ProviderError, ProviderResult,
    bedrock::{accumulator::BedrockStreamAccumulator, build_request_body, parse_response_body},
    default_headers_from_env,
    models::{ProviderRequest, ProviderResponse, ProviderStreamChunk},
    sse::{StreamAccumulator, accumulate_sse},
};

/// Foundry pins the Anthropic API version with a header; the `anthropic_version`
/// body field is Bedrock-only.
const ANTHROPIC_VERSION: &str = "2023-06-01";

#[derive(Debug, Error)]
pub enum FoundryError {
    #[error("Request failed: {0}")]
    RequestError(#[from] reqwest::Error),
    #[error("Failed to parse response: {0}")]
    ParseError(#[from] serde_json::Error),
    #[error("Configuration error: {0}")]
    ConfigError(String),
    #[error("Foundry API error ({status_code}): {message}")]
    ApiError { status_code: u16, message: String },
}

impl From<Infallible> for FoundryError {
    fn from(never: Infallible) -> Self {
        match never {}
    }
}

impl From<FoundryError> for ProviderError {
    fn from(e: FoundryError) -> Self {
        match e {
            FoundryError::RequestError(e) => {
                ProviderError::RequestError(super::format_error_chain(&e))
            }
            FoundryError::ParseError(e) => ProviderError::ParseError(e.to_string()),
            FoundryError::ConfigError(s) => ProviderError::ConfigError(s),
            FoundryError::ApiError {
                status_code,
                message,
            } => ProviderError::ApiError {
                status_code,
                message,
                retryable: status_code == 429 || status_code >= 500,
                resource_exhausted: status_code == 429,
            },
        }
    }
}

type FoundryResult<T> = Result<T, FoundryError>;

/// `FOUNDRY_BASE_URL` wins over `FOUNDRY_RESOURCE_ID`; both normalize to the
/// `/anthropic` root that serves `/v1/messages`.
fn foundry_base_url() -> FoundryResult<String> {
    if let Some(base_url) = non_empty_env(env::llm::FOUNDRY_BASE_URL) {
        return Ok(normalize_base_url(&base_url));
    }
    let resource_id = non_empty_env(env::llm::FOUNDRY_RESOURCE_ID).ok_or_else(|| {
        FoundryError::ConfigError(
            "FOUNDRY_RESOURCE_ID or FOUNDRY_BASE_URL must be set when LLM_PROVIDER is foundry"
                .to_string(),
        )
    })?;
    Ok(normalize_base_url(&format!(
        "https://{resource_id}.services.ai.azure.com"
    )))
}

/// Accepts the portal endpoint (`https://r.services.ai.azure.com`) or the
/// already-complete `/anthropic` root.
fn normalize_base_url(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.ends_with("/anthropic") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/anthropic")
    }
}

fn non_empty_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

/// Anthropic provider backed by a Microsoft Foundry deployment. `model` is the
/// deployment name, so the model-capability gates in `build_request_body`
/// (adaptive thinking, dropped sampling params) only fire when the deployment
/// is named after the model — which is Foundry's own default.
#[derive(Clone)]
pub struct FoundryClient {
    client: reqwest::Client,
    api_key: String,
    api_base_url: String,
}

impl FoundryClient {
    pub fn new() -> ProviderResult<Self> {
        Self::build().map_err(Into::into)
    }

    fn build() -> FoundryResult<Self> {
        let api_key = std::env::var(env::llm::API_KEY).map_err(|_| {
            FoundryError::ConfigError("LLM_API_KEY environment variable not set".to_string())
        })?;
        let api_base_url = foundry_base_url()?;
        let default_headers = default_headers_from_env().map_err(FoundryError::ConfigError)?;

        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(env::llm::HTTP_TIMEOUT_SECS.get()))
            .default_headers(default_headers)
            .build()
            .map_err(|e| FoundryError::ConfigError(format!("Failed to build HTTP client: {e}")))?;

        Ok(Self {
            client,
            api_key,
            api_base_url,
        })
    }

    pub fn api_base_url(&self) -> &str {
        &self.api_base_url
    }

    fn body_for(
        &self,
        model: &str,
        request: &ProviderRequest,
        stream: bool,
    ) -> ProviderResult<Value> {
        let mut body = build_request_body(model, request)?;
        if let Some(obj) = body.as_object_mut() {
            obj.remove("anthropic_version");
            obj.insert("model".to_string(), Value::String(model.to_string()));
            if stream {
                obj.insert("stream".to_string(), Value::Bool(true));
            }
        }
        Ok(body)
    }

    async fn send(&self, body: &Value) -> FoundryResult<reqwest::Response> {
        let response = self
            .client
            .post(format!("{}/v1/messages", self.api_base_url))
            .header("api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("Content-Type", "application/json")
            .json(body)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log::error!("Foundry API error ({}): {}", status, error_text);
            let message = serde_json::from_str::<Value>(&error_text)
                .ok()
                .and_then(|v| {
                    v.get("error")
                        .and_then(|e| e.get("message"))
                        .and_then(|m| m.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or(error_text);
            return Err(FoundryError::ApiError {
                status_code: status.as_u16(),
                message,
            });
        }

        Ok(response)
    }
}

impl LanguageModelClient for FoundryClient {
    async fn generate_content(
        &self,
        model: &str,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        let body = self.body_for(model, request, false)?;
        let response = self.send(&body).await.map_err(ProviderError::from)?;
        let response_json: Value = response.json().await.map_err(FoundryError::from)?;

        Ok(parse_response_body(model, &response_json))
    }

    async fn generate_content_stream(
        &self,
        model: &str,
        request: &ProviderRequest,
        chunk_tx: &UnboundedSender<ProviderStreamChunk>,
    ) -> ProviderResult<ProviderResponse> {
        let body = self.body_for(model, request, true)?;
        let response = self.send(&body).await.map_err(ProviderError::from)?;

        accumulate_sse::<FoundryStreamAccumulator, FoundryError>(
            response.bytes_stream(),
            model,
            chunk_tx,
        )
        .await
        .map_err(Into::into)
    }
}

/// Foundry streams the same Anthropic events Bedrock does, framed as SSE
/// instead of an AWS event stream.
#[derive(Default)]
struct FoundryStreamAccumulator(BedrockStreamAccumulator);

impl StreamAccumulator for FoundryStreamAccumulator {
    type Chunk = Value;
    type Error = Infallible;

    fn ingest(&mut self, chunk: Value, tx: &UnboundedSender<ProviderStreamChunk>) {
        self.0.ingest(&chunk, tx);
    }

    fn try_into_response(self, model: &str) -> Result<ProviderResponse, Infallible> {
        Ok(self.0.into_response(model))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::models::{ProviderContent, ProviderPart};
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn normalize_base_url_appends_anthropic_root() {
        assert_eq!(
            normalize_base_url("https://my-resource.services.ai.azure.com/"),
            "https://my-resource.services.ai.azure.com/anthropic"
        );
        assert_eq!(
            normalize_base_url("https://my-resource.services.ai.azure.com/anthropic"),
            "https://my-resource.services.ai.azure.com/anthropic"
        );
    }

    fn text_request(text: &str) -> ProviderRequest {
        ProviderRequest {
            contents: vec![ProviderContent {
                role: Some("user".to_string()),
                parts: Some(vec![ProviderPart {
                    text: Some(text.to_string()),
                    ..Default::default()
                }]),
            }],
            system_instruction: None,
            tools: None,
            generation_config: None,
            service_tier: None,
            provider: None,
            model_size: None,
        }
    }

    /// Foundry resolves its endpoint and auth from env at construction time, so
    /// the only way to cover that wiring is to set the vars.
    #[tokio::test]
    async fn posts_anthropic_messages_with_api_key_header() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/anthropic/v1/messages"))
            .and(header("api-key", "foundry-test-key"))
            .and(header("anthropic-version", ANTHROPIC_VERSION))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "content": [{"type": "text", "text": "pong"}],
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 3, "output_tokens": 1},
            })))
            .mount(&server)
            .await;

        let client = crate::llm::with_env_vars(
            &[
                (env::llm::API_KEY, "foundry-test-key"),
                (env::llm::FOUNDRY_BASE_URL, &server.uri()),
            ],
            || FoundryClient::new().unwrap(),
        );

        let response = client
            .generate_content("my-deployment", &text_request("ping"))
            .await
            .unwrap();

        let requests = server.received_requests().await.unwrap();
        assert_eq!(requests.len(), 1);
        let body: Value = requests[0].body_json().unwrap();
        assert_eq!(body["model"], "my-deployment");
        assert!(
            body.get("anthropic_version").is_none(),
            "the bedrock-only body field must not reach Foundry"
        );
        assert_eq!(body["messages"][0]["content"][0]["text"], "ping");
        assert_eq!(
            response.candidates.unwrap()[0]
                .content
                .as_ref()
                .unwrap()
                .parts
                .as_ref()
                .unwrap()[0]
                .text
                .as_deref(),
            Some("pong")
        );
    }

    /// Foundry frames Anthropic events as SSE where Bedrock uses an AWS event
    /// stream, so the shared accumulator has to survive the reframing.
    #[tokio::test]
    async fn streams_anthropic_sse_events_into_text_chunks() {
        let sse = concat!(
            "event: message_start\n",
            "data: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":3}}}\n\n",
            "event: content_block_start\n",
            "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"po\"}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"ng\"}}\n\n",
            "event: message_delta\n",
            "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":2}}\n\n",
            "event: message_stop\n",
            "data: {\"type\":\"message_stop\"}\n\n",
        );
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/anthropic/v1/messages"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "text/event-stream")
                    .set_body_string(sse),
            )
            .mount(&server)
            .await;

        let client = crate::llm::with_env_vars(
            &[
                (env::llm::API_KEY, "foundry-test-key"),
                (env::llm::FOUNDRY_BASE_URL, &server.uri()),
            ],
            || FoundryClient::new().unwrap(),
        );

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let response = client
            .generate_content_stream("my-deployment", &text_request("ping"), &tx)
            .await
            .unwrap();
        drop(tx);

        let mut streamed = String::new();
        while let Some(chunk) = rx.recv().await {
            if let ProviderStreamChunk::Text(text) = chunk {
                streamed.push_str(&text);
            }
        }
        assert_eq!(streamed, "pong");

        let body: Value = server.received_requests().await.unwrap()[0]
            .body_json()
            .unwrap();
        assert_eq!(body["stream"], true);
        assert_eq!(
            response.candidates.unwrap()[0]
                .content
                .as_ref()
                .unwrap()
                .parts
                .as_ref()
                .unwrap()[0]
                .text
                .as_deref(),
            Some("pong")
        );
    }
}
