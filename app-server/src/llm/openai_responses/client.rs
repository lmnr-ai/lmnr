#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use super::accumulator::OpenAIResponsesStreamAccumulator;
use super::conversions::{
    parse_openai_responses_response, provider_request_to_responses_body,
    provider_request_to_responses_stream_body,
};
use crate::llm::openai::{
    OpenAIError, OpenAIHttpConfig, OpenAIResult, build_http_config, send_openai_request,
};
use crate::llm::{
    LanguageModelClient, ProviderResult,
    models::{ProviderRequest, ProviderResponse, ProviderStreamChunk},
    sse::accumulate_sse,
};
use tokio::sync::mpsc::UnboundedSender;

/// OpenAI provider using the Responses API (`/responses`). Registered under the
/// `openai_responses` provider name (via `LLM_PROVIDER`), separate from the
/// Chat Completions [`OpenAIClient`](crate::llm::openai::OpenAIClient).
#[derive(Clone)]
pub struct OpenAIResponsesClient {
    client: reqwest::Client,
    api_key: String,
    api_base_url: String,
}

impl OpenAIResponsesClient {
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

impl LanguageModelClient for OpenAIResponsesClient {
    async fn generate_content(
        &self,
        model: &str,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        let body = provider_request_to_responses_body(model, request);
        let url = format!("{}/responses", self.api_base_url);

        let response = send_openai_request(&self.client, &self.api_key, &url, &body).await?;
        let response_text = response.text().await.map_err(OpenAIError::from)?;
        let response_json: serde_json::Value =
            serde_json::from_str(&response_text).map_err(OpenAIError::from)?;

        parse_openai_responses_response(response_json).map_err(Into::into)
    }

    async fn generate_content_stream(
        &self,
        model: &str,
        request: &ProviderRequest,
        chunk_tx: &UnboundedSender<ProviderStreamChunk>,
    ) -> ProviderResult<ProviderResponse> {
        let body = provider_request_to_responses_stream_body(model, request);
        let url = format!("{}/responses", self.api_base_url);

        let response = send_openai_request(&self.client, &self.api_key, &url, &body).await?;

        accumulate_sse::<OpenAIResponsesStreamAccumulator, OpenAIError>(
            response.bytes_stream(),
            model,
            chunk_tx,
        )
        .await
        .map_err(Into::into)
    }
}
