#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use super::accumulator::OpenAIResponsesStreamAccumulator;
use super::conversions::{
    parse_openai_responses_response, provider_request_to_responses_body,
    provider_request_to_responses_stream_body,
};
use crate::llm::openai::{
    OpenAIError, OpenAIFlavor, OpenAIHttpConfig, OpenAIResult, build_http_config, endpoint_url,
    send_openai_request,
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
    api_version: Option<String>,
    flavor: OpenAIFlavor,
}

impl OpenAIResponsesClient {
    pub fn new() -> OpenAIResult<Self> {
        Self::with_flavor(OpenAIFlavor::OpenAI)
    }

    /// Azure OpenAI over the Responses API; `model` is the deployment name.
    pub fn azure_openai() -> OpenAIResult<Self> {
        Self::with_flavor(OpenAIFlavor::AzureOpenAI)
    }

    fn with_flavor(flavor: OpenAIFlavor) -> OpenAIResult<Self> {
        let OpenAIHttpConfig {
            client,
            api_key,
            api_base_url,
            api_version,
            flavor,
        } = build_http_config(flavor)?;
        Ok(Self {
            client,
            api_key,
            api_base_url,
            api_version,
            flavor,
        })
    }

    pub fn api_base_url(&self) -> &str {
        &self.api_base_url
    }

    fn url(&self) -> String {
        endpoint_url(
            &self.api_base_url,
            "/responses",
            self.api_version.as_deref(),
        )
    }
}

impl LanguageModelClient for OpenAIResponsesClient {
    async fn generate_content(
        &self,
        model: &str,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        let body = provider_request_to_responses_body(model, request)?;
        let url = self.url();

        let response =
            send_openai_request(&self.client, self.flavor, &self.api_key, &url, &body).await?;
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
        let body = provider_request_to_responses_stream_body(model, request)?;
        let url = self.url();

        let response =
            send_openai_request(&self.client, self.flavor, &self.api_key, &url, &body).await?;

        accumulate_sse::<OpenAIResponsesStreamAccumulator, OpenAIError>(
            response.bytes_stream(),
            model,
            chunk_tx,
        )
        .await
        .map_err(Into::into)
    }
}
