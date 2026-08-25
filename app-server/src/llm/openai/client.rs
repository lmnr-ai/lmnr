#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use super::accumulator::OpenAIStreamAccumulator;
use super::conversions::{
    parse_openai_response, provider_request_to_openai_body, provider_request_to_openai_stream_body,
};
use super::{OpenAIHttpConfig, OpenAIResult, build_http_config, send_openai_request};
use crate::llm::{
    LanguageModelClient, ProviderResult,
    models::{ProviderRequest, ProviderResponse, ProviderStreamChunk},
    sse::accumulate_sse,
};
use tokio::sync::mpsc::UnboundedSender;

/// OpenAI provider using the Chat Completions API (`/chat/completions`).
#[derive(Clone)]
pub struct OpenAIClient {
    client: reqwest::Client,
    api_key: String,
    api_base_url: String,
}

impl OpenAIClient {
    pub fn new() -> OpenAIResult<Self> {
        let OpenAIHttpConfig {
            client,
            api_key,
            api_base_url,
        } = build_http_config()?;
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

        let response = send_openai_request(&self.client, &self.api_key, &url, &body).await?;
        let response_text = response.text().await.map_err(super::OpenAIError::from)?;
        let response_json: serde_json::Value =
            serde_json::from_str(&response_text).map_err(super::OpenAIError::from)?;

        parse_openai_response(response_json).map_err(Into::into)
    }

    async fn generate_content_stream(
        &self,
        model: &str,
        request: &ProviderRequest,
        chunk_tx: &UnboundedSender<ProviderStreamChunk>,
    ) -> ProviderResult<ProviderResponse> {
        let body = provider_request_to_openai_stream_body(model, request);
        let url = format!("{}/chat/completions", self.api_base_url);

        let response = send_openai_request(&self.client, &self.api_key, &url, &body).await?;

        accumulate_sse::<OpenAIStreamAccumulator, super::OpenAIError>(
            response.bytes_stream(),
            model,
            chunk_tx,
        )
        .await
        .map_err(Into::into)
    }
}
