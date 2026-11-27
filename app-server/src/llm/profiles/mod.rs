//! Workspace-scoped LLM profiles: provider + credentials + models that a
//! self-hosted signal runs on instead of the `LLM_*` env vars.
//!
//! The row shapes mirror the Zod schemas in
//! `frontend/lib/actions/llm-profiles/schema.ts`. `service` owns every write
//! (validation, secret merge/prune, encryption) for the frontend, project-API
//! and CLI routes; `store` reads, decrypts and builds clients for signal runs.

#![cfg_attr(not(feature = "signals"), allow(dead_code))]

mod build;
mod probe;
pub mod service;
mod store;

pub use probe::probe;
pub use store::LlmProfileStore;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Wire names shared with the frontend (`LLM_PROFILE_PROVIDERS`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
#[schemars(description = "The provider API a profile calls.")]
pub enum LlmProfileProvider {
    OpenaiCompletions,
    OpenaiResponses,
    Anthropic,
    Gemini,
    Groq,
    Mistral,
    Bedrock,
    AzureChatCompletions,
    AzureResponses,
    AzureAnthropic,
    /// OpenAI-compatible gateway over Chat Completions.
    Custom,
    /// OpenAI-compatible gateway over the Responses API.
    CustomResponses,
}

impl LlmProfileProvider {
    /// The serde wire name, as stored in `llm_profiles.provider`.
    pub fn wire_name(self) -> &'static str {
        match self {
            Self::OpenaiCompletions => "openai_completions",
            Self::OpenaiResponses => "openai_responses",
            Self::Anthropic => "anthropic",
            Self::Gemini => "gemini",
            Self::Groq => "groq",
            Self::Mistral => "mistral",
            Self::Bedrock => "bedrock",
            Self::AzureChatCompletions => "azure_chat_completions",
            Self::AzureResponses => "azure_responses",
            Self::AzureAnthropic => "azure_anthropic",
            Self::Custom => "custom",
            Self::CustomResponses => "custom_responses",
        }
    }

    /// A user-supplied base URL plus optional custom headers, whichever API shape it speaks.
    pub fn is_custom_gateway(self) -> bool {
        matches!(self, Self::Custom | Self::CustomResponses)
    }

    /// Provider name reported on spans and used for cost keying: the `model_costs`
    /// provider prefixes (`azure/`, `azure_ai/`), shared with the env-routed path
    /// in `LlmClient::resolve_model_provider`.
    pub fn reported_name(self) -> &'static str {
        match self {
            Self::OpenaiCompletions
            | Self::OpenaiResponses
            | Self::Custom
            | Self::CustomResponses => "openai",
            Self::Anthropic => "anthropic",
            Self::Gemini => "gemini",
            Self::Groq => "groq",
            Self::Mistral => "mistral",
            Self::Bedrock => "bedrock",
            Self::AzureChatCompletions | Self::AzureResponses => "azure",
            Self::AzureAnthropic => "azure_ai",
        }
    }
}

/// Non-secret, provider-specific part of `llm_profiles.config`. Fields are
/// permissive on purpose: `service` validates on write, and a stale or
/// hand-edited row should fail with a readable `ConfigError`, not a serde error.
/// Absent options are omitted on the wire because the Zod schema rejects `null`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(
    description = "Provider connection settings; which fields apply depends on the provider."
)]
pub struct ProfileConfig {
    /// How Bedrock authenticates; every other provider uses `api_key`, the default.
    #[serde(default, deserialize_with = "crate::utils::null_as_default")]
    pub auth: ProfileAuth,
    /// AWS region of a Bedrock profile, e.g. `us-east-1`; a Bedrock profile without one is
    /// rejected on save. Leave unset for other providers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    /// Azure resource name (`<name>` in `https://<name>.services.ai.azure.com`). An Azure
    /// profile takes exactly one of this and `baseUrl`; leave unset for other providers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource_id: Option<String>,
    /// Endpoint URL: required for a custom gateway; Azure takes this or `resourceId`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    /// Azure API version; omit for the provider default.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_version: Option<String>,
    /// Names of extra headers a custom gateway receives, with their values in
    /// `secrets.headers`.
    #[serde(
        default,
        deserialize_with = "crate::utils::null_as_default",
        skip_serializing_if = "Vec::is_empty"
    )]
    pub header_names: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
#[schemars(transform = crate::utils::describe_type_tags)]
pub enum ProfileAuth {
    /// The key in `secrets.apiKey`.
    #[default]
    ApiKey,
    /// An AWS access key pair, with the secret half in `secrets.secretAccessKey`.
    AwsKeys {
        /// Access key id of the IAM user or role, e.g. `AKIAIOSFODNN7EXAMPLE`, from the AWS
        /// console (IAM > Security credentials).
        #[serde(rename = "accessKeyId")]
        access_key_id: String,
    },
    /// A Bedrock API key, in `secrets.token`.
    BearerToken,
}

/// Decrypted contents of `llm_profiles.secrets`; also the plaintext shape the
/// write routes accept. Absent keys are omitted on the wire (Zod rejects `null`).
#[derive(Debug, Clone, Default, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(description = "Provider credentials, stored encrypted and only ever returned masked.")]
pub struct ProfileSecrets {
    /// Provider API key, for every provider except Bedrock.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// AWS secret access key, for Bedrock with `aws_keys` auth.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secret_access_key: Option<String>,
    /// Bedrock API key, for `bearer_token` auth.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    /// Values of the custom gateway headers named in `config.headerNames`, keyed by name.
    #[serde(
        default,
        deserialize_with = "crate::utils::null_as_default",
        skip_serializing_if = "HashMap::is_empty"
    )]
    pub headers: HashMap<String, String>,
}

/// `{nonce, value}` hex pair as stored by the frontend (`encryptValue`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedSecrets {
    pub nonce: String,
    pub value: String,
}

/// A profile row plus its models, as cached in Redis. Secrets stay encrypted
/// here; they are only decrypted while building a client.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmProfile {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub provider: LlmProfileProvider,
    pub config: ProfileConfig,
    pub secrets: EncryptedSecrets,
    pub models: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// What a signal pins: which profile and which of its models. `project_id` is
/// the caller's project; the store refuses profiles from another workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LlmProfileRoute {
    pub profile_id: Uuid,
    pub model: String,
    pub project_id: Uuid,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Literal JSON the frontend writes for each provider must deserialize.
    #[test]
    fn config_round_trips_frontend_shapes() {
        let cases: Vec<(&str, &str)> = vec![
            ("openai_completions", r#"{"auth":{"type":"api_key"}}"#),
            ("anthropic", r#"{"auth":{"type":"api_key"}}"#),
            ("groq", r#"{"auth":{"type":"api_key"}}"#),
            ("mistral", r#"{"auth":{"type":"api_key"}}"#),
            (
                "bedrock",
                r#"{"region":"us-east-1","auth":{"type":"aws_keys","accessKeyId":"AKIA"}}"#,
            ),
            (
                "bedrock",
                r#"{"region":"eu-west-1","auth":{"type":"bearer_token"}}"#,
            ),
            (
                "azure_responses",
                r#"{"resourceId":"my-res","apiVersion":"preview","auth":{"type":"api_key"}}"#,
            ),
            (
                "custom",
                r#"{"baseUrl":"https://gw.example.com/v1","headerNames":["X-Tenant"],"auth":{"type":"api_key"}}"#,
            ),
            (
                "custom_responses",
                r#"{"baseUrl":"https://gw.example.com/v1","headerNames":["X-Tenant"],"auth":{"type":"api_key"}}"#,
            ),
        ];
        for (provider, config) in cases {
            let provider: LlmProfileProvider =
                serde_json::from_value(serde_json::Value::String(provider.to_string())).unwrap();
            let parsed: ProfileConfig = serde_json::from_str(config).unwrap();
            let _ = provider.reported_name();
            let back = serde_json::to_string(&parsed).unwrap();
            let again: ProfileConfig = serde_json::from_str(&back).unwrap();
            assert_eq!(again.header_names, parsed.header_names);
        }
    }

    #[test]
    fn bedrock_auth_variants_parse() {
        let keys: ProfileAuth =
            serde_json::from_str(r#"{"type":"aws_keys","accessKeyId":"AKIA"}"#).unwrap();
        assert!(matches!(keys, ProfileAuth::AwsKeys { access_key_id } if access_key_id == "AKIA"));
        let bearer: ProfileAuth = serde_json::from_str(r#"{"type":"bearer_token"}"#).unwrap();
        assert!(matches!(bearer, ProfileAuth::BearerToken));
    }

    #[test]
    fn secrets_parse_with_missing_fields() {
        let secrets: ProfileSecrets =
            serde_json::from_str(r#"{"apiKey":"sk-1","headers":{"X-Tenant":"acme"}}"#).unwrap();
        assert_eq!(secrets.api_key.as_deref(), Some("sk-1"));
        assert_eq!(secrets.headers["X-Tenant"], "acme");
        assert!(secrets.token.is_none());
    }
}
