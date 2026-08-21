#![cfg_attr(not(feature = "signals"), allow(dead_code))]

mod accumulator;
pub mod client;
pub mod conversions;

pub use client::OpenAIClient;

use crate::env;
use crate::llm::default_headers_from_env;
use serde_json::Value;
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum OpenAIError {
    #[error("Request failed: {0}")]
    RequestError(#[from] reqwest::Error),

    #[error("Failed to parse response: {0}")]
    ParseError(#[from] serde_json::Error),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("OpenAI API error ({status_code}): {message}")]
    ApiError { status_code: u16, message: String },
}

impl OpenAIError {
    pub fn config<S: Into<String>>(msg: S) -> Self {
        OpenAIError::ConfigError(msg.into())
    }
}

impl From<OpenAIError> for super::ProviderError {
    fn from(e: OpenAIError) -> Self {
        match e {
            OpenAIError::RequestError(e) => {
                super::ProviderError::RequestError(super::format_error_chain(&e))
            }
            OpenAIError::ParseError(e) => super::ProviderError::ParseError(e.to_string()),
            OpenAIError::ConfigError(s) => super::ProviderError::ConfigError(s),
            OpenAIError::ApiError {
                status_code,
                message,
            } => {
                let retryable = status_code == 429 || status_code >= 500;
                let resource_exhausted = status_code == 429;
                super::ProviderError::ApiError {
                    status_code,
                    message,
                    retryable,
                    resource_exhausted,
                }
            }
        }
    }
}

pub type OpenAIResult<T> = Result<T, OpenAIError>;

/// Shared HTTP setup for the OpenAI-compatible clients (Chat Completions and
/// Responses). Both read the same `LLM_API_KEY` / `LLM_BASE_URL` and build an
/// identically-configured `reqwest::Client`.
pub(super) struct OpenAIHttpConfig {
    pub client: reqwest::Client,
    pub api_key: String,
    pub api_base_url: String,
}

pub(super) fn build_http_config() -> OpenAIResult<OpenAIHttpConfig> {
    let api_key = std::env::var(env::llm::API_KEY)
        .map_err(|_| OpenAIError::config("LLM_API_KEY environment variable not set"))?;

    let raw_base_url = std::env::var(env::llm::BASE_URL)
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string());
    let api_base_url = raw_base_url.trim_end_matches('/').to_string();
    let default_headers = default_headers_from_env().map_err(OpenAIError::config)?;

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(env::llm::HTTP_TIMEOUT_SECS.get()))
        .default_headers(default_headers)
        .build()
        .map_err(|e| OpenAIError::config(format!("Failed to build HTTP client: {}", e)))?;

    Ok(OpenAIHttpConfig {
        client,
        api_key,
        api_base_url,
    })
}

/// POST a JSON body to an OpenAI-compatible endpoint. On a non-success status,
/// extracts the provider's `error.message` and returns an `ApiError`; otherwise
/// hands back the raw response for the caller to read as text or a byte stream.
pub(super) async fn send_openai_request(
    client: &reqwest::Client,
    api_key: &str,
    url: &str,
    body: &Value,
) -> OpenAIResult<reqwest::Response> {
    let response = client
        .post(url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        log::error!("OpenAI API error ({}): {}", status, error_text);
        let message = serde_json::from_str::<Value>(&error_text)
            .ok()
            .and_then(|v| {
                v.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or(error_text);
        return Err(OpenAIError::ApiError {
            status_code: status.as_u16(),
            message,
        });
    }

    Ok(response)
}
