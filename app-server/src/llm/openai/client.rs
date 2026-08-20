#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use super::accumulator::OpenAIStreamAccumulator;
use super::conversions::{
    parse_openai_response, provider_request_to_openai_body, provider_request_to_openai_stream_body,
};
use super::{
    OpenAIFlavor, OpenAIHttpConfig, OpenAIResult, build_http_config, endpoint_url,
    send_openai_request,
};
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
    api_version: Option<String>,
    flavor: OpenAIFlavor,
}

impl OpenAIClient {
    pub fn new() -> OpenAIResult<Self> {
        Self::with_flavor(OpenAIFlavor::OpenAI)
    }

    /// Azure OpenAI over the same Chat Completions wire format; `model` is the
    /// deployment name.
    pub fn azure() -> OpenAIResult<Self> {
        Self::with_flavor(OpenAIFlavor::Azure)
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
            "/chat/completions",
            self.api_version.as_deref(),
        )
    }
}

impl LanguageModelClient for OpenAIClient {
    async fn generate_content(
        &self,
        model: &str,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        let body = provider_request_to_openai_body(model, request);
        let url = self.url();

        let response =
            send_openai_request(&self.client, self.flavor, &self.api_key, &url, &body).await?;
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
        let url = self.url();

        let response =
            send_openai_request(&self.client, self.flavor, &self.api_key, &url, &body).await?;

        accumulate_sse::<OpenAIStreamAccumulator, super::OpenAIError>(
            response.bytes_stream(),
            model,
            chunk_tx,
        )
        .await
        .map_err(Into::into)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env;
    use crate::llm::models::{ProviderContent, ProviderPart};
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// Azure resolves its endpoint and auth from env at construction time, so the
    /// only way to cover that wiring is to set the vars. No other test in this
    /// binary reads them.
    #[tokio::test]
    async fn azure_client_posts_to_v1_route_with_api_key_header() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/openai/v1/chat/completions"))
            .and(header("api-key", "azure-test-key"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "choices": [{"message": {"role": "assistant", "content": "pong"}}],
            })))
            .mount(&server)
            .await;

        let previous_key = std::env::var(env::llm::API_KEY).ok();
        unsafe {
            std::env::set_var(env::llm::API_KEY, "azure-test-key");
            std::env::set_var(env::llm::AZURE_BASE_URL, server.uri());
        }
        let client = OpenAIClient::azure().unwrap();
        unsafe {
            match previous_key {
                Some(key) => std::env::set_var(env::llm::API_KEY, key),
                None => std::env::remove_var(env::llm::API_KEY),
            }
            std::env::remove_var(env::llm::AZURE_BASE_URL);
        }

        let request = ProviderRequest {
            contents: vec![ProviderContent {
                role: Some("user".to_string()),
                parts: Some(vec![ProviderPart {
                    text: Some("ping".to_string()),
                    ..Default::default()
                }]),
            }],
            system_instruction: None,
            tools: None,
            generation_config: None,
            service_tier: None,
            provider: None,
            model_size: None,
        };
        let response = client
            .generate_content("my-deployment", &request)
            .await
            .unwrap();

        let requests = server.received_requests().await.unwrap();
        assert_eq!(requests.len(), 1);
        let body: serde_json::Value = requests[0].body_json().unwrap();
        assert_eq!(body["model"], "my-deployment");
        assert!(
            requests[0].headers.get("authorization").is_none(),
            "azure authenticates with api-key, not a bearer token"
        );
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
