use std::time::{Duration, Instant};

use crate::llm::{
    LanguageModelClient, ProviderContent, ProviderError, ProviderGenerationConfig, ProviderPart,
    ProviderRequest, ProviderResult,
};

use super::{LlmProfile, build::build_client};

/// Backs a settings button, so it is bounded well below `LLM_HTTP_TIMEOUT_SECS`.
const PROBE_TIMEOUT: Duration = Duration::from_secs(15);

/// Builds the profile's client and makes one tiny generation against `model`.
/// Exercises credentials, endpoint, region, custom headers and the model id in
/// a single call; returns the round-trip time.
pub async fn probe(profile: &LlmProfile, model: &str) -> ProviderResult<Duration> {
    let client = build_client(profile)?;
    let request = ProviderRequest {
        contents: vec![ProviderContent {
            role: Some("user".to_string()),
            parts: Some(vec![ProviderPart {
                text: Some("Reply with OK.".to_string()),
                ..Default::default()
            }]),
        }],
        system_instruction: None,
        tools: None,
        generation_config: Some(ProviderGenerationConfig {
            max_output_tokens: Some(16),
            ..Default::default()
        }),
        service_tier: None,
        provider: None,
        model_size: None,
        llm_profile: None,
    };

    let started = Instant::now();
    match tokio::time::timeout(PROBE_TIMEOUT, client.generate_content(model, &request)).await {
        Ok(Ok(_)) => Ok(started.elapsed()),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(ProviderError::RequestError(format!(
            "no response within {}s",
            PROBE_TIMEOUT.as_secs()
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data_plane::crypto;
    use crate::llm::profiles::{EncryptedSecrets, LlmProfileProvider, ProfileConfig};
    use chrono::Utc;
    use uuid::Uuid;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const TEST_KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    fn custom_profile(base_url: &str) -> LlmProfile {
        let id = Uuid::new_v4();
        unsafe { std::env::set_var(crate::env::secrets::AEAD_SECRET_KEY, TEST_KEY) };
        let (nonce, value) = crypto::encrypt(
            &id.to_string(),
            r#"{"apiKey":"sk-probe","headers":{"X-Tenant":"acme"}}"#,
        )
        .unwrap();
        LlmProfile {
            id,
            workspace_id: Uuid::new_v4(),
            name: "gateway".to_string(),
            provider: LlmProfileProvider::Custom,
            config: ProfileConfig {
                base_url: Some(base_url.to_string()),
                header_names: vec!["X-Tenant".to_string()],
                ..Default::default()
            },
            secrets: EncryptedSecrets { nonce, value },
            models: vec!["m".to_string()],
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn probe_sends_one_tiny_request_with_profile_credentials() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .and(header("authorization", "Bearer sk-probe"))
            .and(header("x-tenant", "acme"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "choices": [{"message": {"role": "assistant", "content": "OK"}}],
            })))
            .mount(&server)
            .await;

        probe(&custom_profile(&server.uri()), "gpt-test")
            .await
            .unwrap();

        let requests = server.received_requests().await.unwrap();
        assert_eq!(requests.len(), 1);
        let body: serde_json::Value = requests[0].body_json().unwrap();
        assert_eq!(body["model"], "gpt-test");
        assert!(body["tools"].is_null());
    }

    #[tokio::test]
    async fn probe_surfaces_provider_rejections() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(401).set_body_json(serde_json::json!({
                "error": {"message": "Incorrect API key provided"},
            })))
            .mount(&server)
            .await;

        let err = probe(&custom_profile(&server.uri()), "gpt-test")
            .await
            .unwrap_err();
        assert!(
            matches!(
                err,
                ProviderError::ApiError {
                    status_code: 401,
                    ..
                }
            ),
            "{err}"
        );
    }
}
