#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use super::conversions::{parse_openai_response, provider_request_to_openai_body};
use super::{
    OpenAIExplicitConfig, OpenAIFlavor, OpenAIHttpConfig, OpenAIResult, affinity_for,
    build_http_config, build_http_config_from, endpoint_url, post_openai_request,
    send_openai_request,
};
use crate::llm::{
    LanguageModelClient, ProviderResult,
    models::{ProviderRequest, ProviderResponse},
};
use reqwest::header::HeaderName;

/// OpenAI provider using the Chat Completions API (`/chat/completions`).
#[derive(Clone)]
pub struct OpenAIClient {
    client: reqwest::Client,
    api_key: String,
    api_base_url: String,
    api_version: Option<String>,
    flavor: OpenAIFlavor,
    affinity_header: Option<HeaderName>,
}

impl OpenAIClient {
    pub fn new() -> OpenAIResult<Self> {
        Self::with_flavor(OpenAIFlavor::OpenAI)
    }

    /// Azure over the same Chat Completions wire format; `model` is the
    /// deployment name.
    pub fn azure() -> OpenAIResult<Self> {
        Self::with_flavor(OpenAIFlavor::Azure)
    }

    fn with_flavor(flavor: OpenAIFlavor) -> OpenAIResult<Self> {
        Ok(Self::from_http_config(build_http_config(flavor)?))
    }

    /// Build from explicit values (LLM profiles) instead of env.
    pub(crate) fn from_config(config: OpenAIExplicitConfig) -> OpenAIResult<Self> {
        Ok(Self::from_http_config(build_http_config_from(config)?))
    }

    fn from_http_config(config: OpenAIHttpConfig) -> Self {
        let OpenAIHttpConfig {
            client,
            api_key,
            api_base_url,
            api_version,
            flavor,
            affinity_header,
        } = config;
        Self {
            client,
            api_key,
            api_base_url,
            api_version,
            flavor,
            affinity_header,
        }
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

    /// POSTs a caller-built Chat Completions body as-is and returns the upstream
    /// status and body unparsed, error statuses included. For proxying.
    /// `affinity_key` goes out in the client's affinity header, when it has one.
    pub async fn post_raw(
        &self,
        body: &serde_json::Value,
        affinity_key: Option<&str>,
    ) -> Result<RawResponse, reqwest::Error> {
        let response = post_openai_request(
            &self.client,
            self.flavor,
            &self.api_key,
            &self.url(),
            body,
            self.affinity_header.as_ref().zip(affinity_key),
        )
        .await?;
        let status = response.status().as_u16();
        let body = response.bytes().await?;
        Ok(RawResponse { status, body })
    }
}

pub struct RawResponse {
    pub status: u16,
    pub body: bytes::Bytes,
}

impl LanguageModelClient for OpenAIClient {
    async fn generate_content(
        &self,
        model: &str,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        let body = provider_request_to_openai_body(model, request);
        let url = self.url();

        let response = send_openai_request(
            &self.client,
            self.flavor,
            &self.api_key,
            &url,
            &body,
            affinity_for(&self.affinity_header, request),
        )
        .await?;
        let response_text = response.text().await.map_err(super::OpenAIError::from)?;
        let response_json: serde_json::Value =
            serde_json::from_str(&response_text).map_err(super::OpenAIError::from)?;

        parse_openai_response(response_json).map_err(Into::into)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env;
    use crate::llm::LlmRoute;
    use crate::llm::models::{ProviderContent, ProviderPart};
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// Azure resolves its endpoint and auth from env at construction time, so the
    /// only way to cover that wiring is to set the vars.
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

        let client = crate::llm::with_env_vars(
            &[
                (env::llm::API_KEY, "azure-test-key"),
                (env::llm::AZURE_BASE_URL, &server.uri()),
            ],
            || OpenAIClient::azure().unwrap(),
        );

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
            affinity_key: None,
            route: LlmRoute::default(),
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

    fn ping_request(affinity_key: Option<&str>) -> ProviderRequest {
        ProviderRequest {
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
            affinity_key: affinity_key.map(str::to_string),
            route: LlmRoute::default(),
        }
    }

    async fn affinity_headers_sent(header_env: &str, keys: &[Option<&str>]) -> Vec<Option<String>> {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "choices": [{"message": {"role": "assistant", "content": "pong"}}],
            })))
            .mount(&server)
            .await;
        let client = crate::llm::with_env_vars(
            &[
                (env::llm::API_KEY, "test-key"),
                (env::llm::BASE_URL, &server.uri()),
                (env::llm::AFFINITY_HEADER, header_env),
            ],
            || OpenAIClient::new().unwrap(),
        );
        for key in keys {
            client
                .generate_content("flow", &ping_request(*key))
                .await
                .unwrap();
        }
        server
            .received_requests()
            .await
            .unwrap()
            .iter()
            .map(|r| {
                r.headers
                    .get("modal-routing-affinity-key")
                    .map(|v| v.to_str().unwrap().to_string())
            })
            .collect()
    }

    #[tokio::test]
    async fn affinity_key_is_sent_in_the_configured_header() {
        let sent = affinity_headers_sent(
            "Modal-Routing-Affinity-Key",
            &[Some("run-1"), None, Some("run-2")],
        )
        .await;
        assert_eq!(
            sent,
            [Some("run-1".to_string()), None, Some("run-2".to_string())]
        );
    }

    #[tokio::test]
    async fn affinity_key_is_not_sent_without_a_configured_header() {
        assert_eq!(affinity_headers_sent("", &[Some("run-1")]).await, [None]);
    }

    #[tokio::test]
    async fn post_raw_sends_the_affinity_key_in_the_configured_header() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;
        let client = crate::llm::with_env_vars(
            &[
                (env::llm::API_KEY, "test-key"),
                (env::llm::BASE_URL, &server.uri()),
                (env::llm::AFFINITY_HEADER, "Modal-Routing-Affinity-Key"),
            ],
            || OpenAIClient::new().unwrap(),
        );
        let body = serde_json::json!({"messages": []});
        client.post_raw(&body, Some("run-hash")).await.unwrap();
        client.post_raw(&body, None).await.unwrap();

        let sent: Vec<_> = server
            .received_requests()
            .await
            .unwrap()
            .iter()
            .map(|r| {
                r.headers
                    .get("modal-routing-affinity-key")
                    .map(|v| v.to_str().unwrap().to_string())
            })
            .collect();
        assert_eq!(sent, [Some("run-hash".to_string()), None]);
    }

    #[test]
    fn invalid_affinity_header_name_is_a_config_error() {
        let result = crate::llm::with_env_vars(
            &[
                (env::llm::API_KEY, "test-key"),
                (env::llm::AFFINITY_HEADER, "not a header"),
            ],
            OpenAIClient::new,
        );
        assert!(matches!(
            result,
            Err(super::super::OpenAIError::ConfigError(_))
        ));
    }
}
