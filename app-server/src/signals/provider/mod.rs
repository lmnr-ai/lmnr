pub mod bedrock;
pub mod gemini;
pub mod models;

pub use bedrock::BedrockClient;
pub use gemini::GeminiClient;
pub use models::*;

use enum_dispatch::enum_dispatch;
use std::env;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("Request failed: {0}")]
    RequestError(String),
    #[error("Failed to parse response: {0}")]
    ParseError(String),
    #[error("Configuration error: {0}")]
    ConfigError(String),
    #[error("Not supported: {0}")]
    NotSupported(String),
    #[error("API error ({status_code}): {message}")]
    ApiError {
        status_code: u16,
        message: String,
        retryable: bool,
        resource_exhausted: bool,
    },
}

impl ProviderError {
    pub fn is_retryable(&self) -> bool {
        match self {
            ProviderError::ApiError { retryable, .. } => *retryable,
            ProviderError::RequestError(_) => true,
            _ => false,
        }
    }

    pub fn is_resource_exhausted(&self) -> bool {
        match self {
            ProviderError::ApiError {
                resource_exhausted, ..
            } => *resource_exhausted,
            _ => false,
        }
    }
}

pub type ProviderResult<T> = Result<T, ProviderError>;

#[enum_dispatch]
pub trait LanguageModelClient: Send + Sync {
    async fn generate_content(
        &self,
        model: &str,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse>;

    async fn create_batch(
        &self,
        _model: &str,
        _requests: Vec<ProviderRequestItem>,
        _display_name: Option<String>,
    ) -> ProviderResult<ProviderBatchOperation> {
        Err(ProviderError::NotSupported(
            "Batch operations are not supported by this provider".to_string(),
        ))
    }

    async fn get_batch(&self, _batch_name: &str) -> ProviderResult<ProviderBatchOperation> {
        Err(ProviderError::NotSupported(
            "Batch operations are not supported by this provider".to_string(),
        ))
    }
}

#[derive(Clone)]
#[enum_dispatch(LanguageModelClient)]
pub enum ProviderClient {
    Gemini(GeminiClient),
    Bedrock(BedrockClient),
}

impl ProviderClient {
    /// Returns the canonical name of the active provider (e.g. "gemini", "bedrock").
    pub fn provider_name(&self) -> &'static str {
        match self {
            ProviderClient::Gemini(_) => "gemini",
            ProviderClient::Bedrock(_) => "bedrock",
        }
    }
}

/// Checks whether the required environment variables are set for the Gemini provider.
fn has_gemini_credentials() -> bool {
    env::var("GOOGLE_GENERATIVE_AI_API_KEY").is_ok()
}

/// Checks whether the required environment variables are set for the Bedrock provider.
fn has_bedrock_credentials() -> bool {
    env::var("AWS_ACCESS_KEY_ID").is_ok()
        && env::var("AWS_SECRET_ACCESS_KEY").is_ok()
        && env::var("AWS_REGION").is_ok()
}

/// Initialize a provider client based on configuration and available credentials.
///
/// Resolution order:
/// 1. If `SIGNALS_LLM_PROVIDER` is set (case-insensitive, whitespace-tolerant),
///    attempt to use that provider. Returns an error if the required API keys are missing.
/// 2. Otherwise, try providers in order (Gemini, Bedrock) and use the first one
///    whose credentials are available.
///
/// This function is future-proof: adding a new provider requires adding a new match arm
/// and a corresponding `has_<provider>_credentials()` check.
pub async fn create_provider_client() -> Result<ProviderClient, ProviderError> {
    let explicit_provider = env::var("SIGNALS_LLM_PROVIDER")
        .or_else(|_| env::var("SIGNAL_JOB_LLM_PROVIDER"))
        .ok()
        .map(|v| v.trim().to_lowercase())
        .filter(|v| !v.is_empty());

    if let Some(provider_name) = explicit_provider {
        match provider_name.as_str() {
            "gemini" => {
                if !has_gemini_credentials() {
                    return Err(ProviderError::ConfigError(
                        "SIGNALS_LLM_PROVIDER is set to 'gemini' but GOOGLE_GENERATIVE_AI_API_KEY is not set".to_string(),
                    ));
                }
                let client = GeminiClient::new().map_err(|e| {
                    ProviderError::ConfigError(format!("Failed to create Gemini client: {}", e))
                })?;
                log::info!("Initialized Gemini provider (explicitly configured)");
                Ok(ProviderClient::Gemini(client))
            }
            "bedrock" => {
                if !has_bedrock_credentials() {
                    return Err(ProviderError::ConfigError(
                        "SIGNALS_LLM_PROVIDER is set to 'bedrock' but one or more required AWS env vars are missing (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)".to_string(),
                    ));
                }
                let client = BedrockClient::new().await?;
                log::info!("Initialized Bedrock provider (explicitly configured)");
                Ok(ProviderClient::Bedrock(client))
            }
            other => Err(ProviderError::ConfigError(format!(
                "Unknown SIGNALS_LLM_PROVIDER value: '{}'. Supported providers: gemini, bedrock",
                other
            ))),
        }
    } else {
        // Auto-detect: try providers in order of preference
        if has_gemini_credentials() {
            let client = GeminiClient::new().map_err(|e| {
                ProviderError::ConfigError(format!("Failed to create Gemini client: {}", e))
            })?;
            log::info!("Initialized Gemini provider (auto-detected from credentials)");
            return Ok(ProviderClient::Gemini(client));
        }

        if has_bedrock_credentials() {
            let client = BedrockClient::new().await?;
            log::info!("Initialized Bedrock provider (auto-detected from credentials)");
            return Ok(ProviderClient::Bedrock(client));
        }

        Err(ProviderError::ConfigError(
            "No LLM provider credentials found. Set GOOGLE_GENERATIVE_AI_API_KEY for Gemini or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_REGION for Bedrock.".to_string(),
        ))
    }
}
