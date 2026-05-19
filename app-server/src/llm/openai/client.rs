#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use super::OpenAIError;
use super::conversions::{parse_openai_response, provider_request_to_openai_body};
use crate::llm::{
    LanguageModelClient, ProviderResult,
    models::{ProviderRequest, ProviderResponse},
};
use std::{env, time::Duration};

#[derive(Clone)]
pub struct OpenAIClient {
    client: reqwest::Client,
    api_key: String,
    api_base_url: String,
}

pub type OpenAIResult<T> = Result<T, OpenAIError>;

impl OpenAIClient {
    pub fn new() -> OpenAIResult<Self> {
        let api_key = env::var("LLM_API_KEY")
            .map_err(|_| OpenAIError::config("LLM_API_KEY environment variable not set"))?;

        let raw_base_url = env::var("LLM_BASE_URL")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "https://api.openai.com/v1".to_string());
        let api_base_url = raw_base_url.trim_end_matches('/').to_string();

        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| OpenAIError::config(format!("Failed to build HTTP client: {}", e)))?;

        Ok(Self {
            client,
            api_key,
            api_base_url,
        })
    }

    pub fn api_base_url(&self) -> &str {
        &self.api_base_url
    }
}

impl LanguageModelClient for OpenAIClient {
    async fn generate_content(
        &self,
        model: &str,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        let body = provider_request_to_openai_body(model, request);

        let url = format!("{}/chat/completions", self.api_base_url);
        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(OpenAIError::from)?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log::error!("OpenAI API error ({}): {}", status, error_text);
            let message = serde_json::from_str::<serde_json::Value>(&error_text)
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
            }
            .into());
        }

        let response_text = response.text().await.map_err(OpenAIError::from)?;
        let response_json: serde_json::Value =
            serde_json::from_str(&response_text).map_err(OpenAIError::from)?;

        parse_openai_response(response_json).map_err(Into::into)
    }
}
