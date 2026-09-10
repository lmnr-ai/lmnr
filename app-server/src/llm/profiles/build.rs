use reqwest::header::{HeaderMap, HeaderName, HeaderValue};

use crate::data_plane::crypto;
use crate::llm::{
    AzureAnthropicClient, GeminiClient, OpenAIClient, OpenAIResponsesClient, ProviderClient,
    ProviderError, ProviderResult, azure,
    bedrock::{BedrockClient, BedrockCredentials},
    openai::OpenAIExplicitConfig,
};

use super::{LlmProfile, LlmProfileProvider, ProfileAuth, ProfileSecrets};

/// Decrypts the profile's secrets and builds the matching provider client.
/// Every failure is a `ConfigError` — a bad profile is never retryable.
pub(super) fn build_client(profile: &LlmProfile) -> ProviderResult<ProviderClient> {
    let secrets = decrypt_secrets(profile)?;
    let ctx = |msg: &str| config_error(profile, msg);
    let config = &profile.config;

    let client = match profile.provider {
        LlmProfileProvider::OpenaiCompletions => {
            ProviderClient::OpenAI(OpenAIClient::from_config(OpenAIExplicitConfig {
                api_key: required_secret(profile, &secrets.api_key, "API key")?,
                api_base_url: "https://api.openai.com/v1".to_string(),
                api_version: None,
                default_headers: HeaderMap::new(),
                azure: false,
            })?)
        }
        LlmProfileProvider::OpenaiResponses => ProviderClient::OpenAIResponses(
            OpenAIResponsesClient::from_config(OpenAIExplicitConfig {
                api_key: required_secret(profile, &secrets.api_key, "API key")?,
                api_base_url: "https://api.openai.com/v1".to_string(),
                api_version: None,
                default_headers: HeaderMap::new(),
                azure: false,
            })?,
        ),
        LlmProfileProvider::Anthropic => ProviderClient::AzureAnthropic(
            AzureAnthropicClient::direct(required_secret(profile, &secrets.api_key, "API key")?)?,
        ),
        LlmProfileProvider::Gemini => ProviderClient::Gemini(GeminiClient::with_api_key(
            required_secret(profile, &secrets.api_key, "API key")?,
        )?),
        // OpenAI-compatible Chat Completions hosts with fixed roots and bearer auth.
        LlmProfileProvider::Groq | LlmProfileProvider::Mistral => {
            let api_base_url = if profile.provider == LlmProfileProvider::Groq {
                "https://api.groq.com/openai/v1"
            } else {
                "https://api.mistral.ai/v1"
            };
            ProviderClient::OpenAI(OpenAIClient::from_config(OpenAIExplicitConfig {
                api_key: required_secret(profile, &secrets.api_key, "API key")?,
                api_base_url: api_base_url.to_string(),
                api_version: None,
                default_headers: HeaderMap::new(),
                azure: false,
            })?)
        }
        LlmProfileProvider::Bedrock => {
            let region = config
                .region
                .as_deref()
                .map(str::trim)
                .filter(|r| !r.is_empty())
                .ok_or_else(|| ctx("AWS region is missing"))?;
            let credentials = match &config.auth {
                ProfileAuth::AwsKeys { access_key_id } => BedrockCredentials::AwsKeys {
                    access_key_id: access_key_id.clone(),
                    secret_access_key: required_secret(
                        profile,
                        &secrets.secret_access_key,
                        "AWS secret access key",
                    )?,
                },
                ProfileAuth::BearerToken => BedrockCredentials::BearerToken(required_secret(
                    profile,
                    &secrets.token,
                    "Bedrock bearer token",
                )?),
                ProfileAuth::ApiKey => return Err(ctx("Bedrock needs AWS keys or a bearer token")),
            };
            ProviderClient::Bedrock(BedrockClient::from_credentials(region, credentials))
        }
        LlmProfileProvider::AzureChatCompletions | LlmProfileProvider::AzureResponses => {
            let root = azure::resource_root_from(
                config.resource_id.as_deref(),
                config.base_url.as_deref(),
            )
            .map_err(|e| ctx(&e))?;
            let explicit = OpenAIExplicitConfig {
                api_key: required_secret(profile, &secrets.api_key, "API key")?,
                api_base_url: format!("{root}/openai/v1"),
                api_version: config.api_version.clone(),
                default_headers: HeaderMap::new(),
                azure: true,
            };
            if profile.provider == LlmProfileProvider::AzureChatCompletions {
                ProviderClient::OpenAI(OpenAIClient::from_config(explicit)?)
            } else {
                ProviderClient::OpenAIResponses(OpenAIResponsesClient::from_config(explicit)?)
            }
        }
        LlmProfileProvider::AzureAnthropic => {
            let root = azure::resource_root_from(
                config.resource_id.as_deref(),
                config.base_url.as_deref(),
            )
            .map_err(|e| ctx(&e))?;
            ProviderClient::AzureAnthropic(AzureAnthropicClient::with_resource_root(
                required_secret(profile, &secrets.api_key, "API key")?,
                &root,
            )?)
        }
        LlmProfileProvider::Custom => {
            let base_url = config
                .base_url
                .as_deref()
                .map(str::trim)
                .filter(|u| !u.is_empty())
                .ok_or_else(|| ctx("base URL is missing"))?;
            ProviderClient::OpenAI(OpenAIClient::from_config(OpenAIExplicitConfig {
                api_key: required_secret(profile, &secrets.api_key, "API key")?,
                api_base_url: base_url.to_string(),
                api_version: None,
                default_headers: custom_headers(&config.header_names, &secrets)
                    .map_err(|e| ctx(&e))?,
                azure: false,
            })?)
        }
    };
    Ok(client)
}

/// Prefixed with the profile name so signal-run logs say which profile is broken;
/// connection probes carry no name and get the bare message.
fn config_error(profile: &LlmProfile, msg: &str) -> ProviderError {
    ProviderError::ConfigError(if profile.name.is_empty() {
        msg.to_string()
    } else {
        format!("LLM profile '{}': {msg}", profile.name)
    })
}

/// A secret the provider cannot work without; blank counts as missing.
fn required_secret(
    profile: &LlmProfile,
    value: &Option<String>,
    what: &str,
) -> ProviderResult<String> {
    value
        .clone()
        .filter(|v| !v.is_empty())
        .ok_or_else(|| config_error(profile, &format!("{what} is missing")))
}

pub(super) fn decrypt_secrets(profile: &LlmProfile) -> ProviderResult<ProfileSecrets> {
    let raw = crypto::decrypt(
        &profile.id.to_string(),
        &profile.secrets.nonce,
        &profile.secrets.value,
    )
    .map_err(|e| {
        config_error(
            profile,
            &format!(
                "cannot decrypt credentials ({e}); is AEAD_SECRET_KEY the same for the frontend and app-server?"
            ),
        )
    })?;
    serde_json::from_str(&raw)
        .map_err(|e| config_error(profile, &format!("credentials blob is malformed ({e})")))
}

/// Only names listed in `config.headerNames` are sent; their values live in the secrets.
fn custom_headers(names: &[String], secrets: &ProfileSecrets) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    for name in names {
        let value = secrets
            .headers
            .get(name)
            .ok_or_else(|| format!("value for header '{name}' is missing"))?;
        let header_name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|e| format!("invalid header name '{name}': {e}"))?;
        let header_value = HeaderValue::from_str(value)
            .map_err(|e| format!("invalid value for header '{name}': {e}"))?;
        headers.insert(header_name, header_value);
    }
    Ok(headers)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::profiles::{EncryptedSecrets, ProfileConfig};
    use chrono::Utc;
    use uuid::Uuid;

    const TEST_KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    fn profile(provider: LlmProfileProvider, config: ProfileConfig, secrets: &str) -> LlmProfile {
        let id = Uuid::new_v4();
        let (nonce, value) = {
            unsafe { std::env::set_var(crate::env::secrets::AEAD_SECRET_KEY, TEST_KEY) };
            crypto::encrypt(&id.to_string(), secrets).unwrap()
        };
        LlmProfile {
            id,
            workspace_id: Uuid::new_v4(),
            name: "test".to_string(),
            provider,
            config,
            secrets: EncryptedSecrets { nonce, value },
            models: vec!["m".to_string()],
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn builds_openai_client_from_encrypted_api_key() {
        let p = profile(
            LlmProfileProvider::OpenaiCompletions,
            ProfileConfig::default(),
            r#"{"apiKey":"sk-test"}"#,
        );
        let client = build_client(&p).unwrap();
        assert!(matches!(client, ProviderClient::OpenAI(_)));
    }

    #[test]
    fn direct_anthropic_targets_anthropic_host() {
        let p = profile(
            LlmProfileProvider::Anthropic,
            ProfileConfig::default(),
            r#"{"apiKey":"sk-ant"}"#,
        );
        let ProviderClient::AzureAnthropic(client) = build_client(&p).unwrap() else {
            panic!("anthropic must build the Messages client");
        };
        assert_eq!(client.api_base_url(), "https://api.anthropic.com");
    }

    #[test]
    fn groq_and_mistral_reuse_the_openai_client() {
        for provider in [LlmProfileProvider::Groq, LlmProfileProvider::Mistral] {
            let p = profile(provider, ProfileConfig::default(), r#"{"apiKey":"k"}"#);
            assert!(matches!(
                build_client(&p).unwrap(),
                ProviderClient::OpenAI(_)
            ));
        }
    }

    #[test]
    fn custom_gateway_requires_every_listed_header() {
        let p = profile(
            LlmProfileProvider::Custom,
            ProfileConfig {
                base_url: Some("https://gw.example.com/v1".to_string()),
                header_names: vec!["X-Tenant".to_string()],
                ..Default::default()
            },
            r#"{"apiKey":"sk-test","headers":{}}"#,
        );
        let Err(err) = build_client(&p) else {
            panic!("missing header value must fail");
        };
        assert!(matches!(err, ProviderError::ConfigError(msg) if msg.contains("X-Tenant")));
    }

    #[test]
    fn bedrock_bearer_token_builds_without_aws_keys() {
        let p = profile(
            LlmProfileProvider::Bedrock,
            ProfileConfig {
                region: Some("us-east-1".to_string()),
                auth: ProfileAuth::BearerToken,
                ..Default::default()
            },
            r#"{"token":"bedrock-api-key"}"#,
        );
        assert!(matches!(
            build_client(&p).unwrap(),
            ProviderClient::Bedrock(_)
        ));
    }

    #[test]
    fn wrong_aad_is_a_config_error() {
        let mut p = profile(
            LlmProfileProvider::Gemini,
            ProfileConfig::default(),
            r#"{"apiKey":"g-test"}"#,
        );
        p.id = Uuid::new_v4();
        let Err(err) = build_client(&p) else {
            panic!("wrong AAD must fail");
        };
        assert!(matches!(err, ProviderError::ConfigError(msg) if msg.contains("decrypt")));
    }
}
