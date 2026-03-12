pub mod bedrock;
pub mod gemini;
pub mod models;

pub use bedrock::BedrockClient;
pub use gemini::GeminiClient;
pub use models::*;

use enum_dispatch::enum_dispatch;
use std::env;
use std::sync::OnceLock;
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
    fn supports_batch(&self) -> bool {
        false
    }

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

static ALWAYS_USE_REALTIME: OnceLock<bool> = OnceLock::new();

pub fn always_use_realtime() -> bool {
    *ALWAYS_USE_REALTIME.get().unwrap_or(&false)
}

/// Checks whether the required environment variables are set for the Gemini provider.
pub fn has_gemini_credentials() -> bool {
    env::var("GOOGLE_GENERATIVE_AI_API_KEY").is_ok_and(|v| !v.is_empty())
}

/// Checks whether the required environment variables are set for the Bedrock provider.
pub fn has_bedrock_credentials() -> bool {
    env::var("AWS_ACCESS_KEY_ID").is_ok_and(|v| !v.is_empty())
        && env::var("AWS_SECRET_ACCESS_KEY").is_ok_and(|v| !v.is_empty())
        && env::var("AWS_REGION").is_ok_and(|v| !v.is_empty())
}

/// Resolve the provider name from env var or credential auto-detection.
///
/// Resolution order:
/// 1. If `SIGNALS_LLM_PROVIDER` is set (case-insensitive, whitespace-tolerant), use it.
/// 2. Otherwise, return the first provider whose credentials are available
///    (Gemini first, then Bedrock).
/// 3. Falls back to "gemini" if no credentials are found.
pub fn resolve_provider_name() -> String {
    env::var("SIGNALS_LLM_PROVIDER")
        .ok()
        .map(|v| v.trim().to_lowercase())
        .filter(|v| !v.is_empty())
        .unwrap_or(if has_gemini_credentials() {
            "gemini".to_string()
        } else if has_bedrock_credentials() {
            "bedrock".to_string()
        } else {
            "gemini".to_string()
        })
}

/// Return the default model ID for a given provider name.
pub fn default_model_for_provider(provider: &str) -> String {
    match provider {
        "bedrock" => "global.anthropic.claude-haiku-4-5-20251001-v1:0".to_string(),
        _ => "gemini-3-flash-preview".to_string(),
    }
}

/// Initialize a provider client based on configuration and available credentials.
///
/// Uses [`resolve_provider_name`] for provider selection, then validates credentials
/// and constructs the appropriate client.
pub async fn create_provider_client() -> Result<ProviderClient, ProviderError> {
    let provider_name = resolve_provider_name();
    let always_realtime_env = std::env::var("SIGNALS_ALWAYS_USE_REALTIME")
        .is_ok_and(|v| v.trim().to_lowercase() == "true");

    match provider_name.as_str() {
        "gemini" => {
            if !has_gemini_credentials() {
                return Err(ProviderError::ConfigError(
                    "Provider resolved to 'gemini' but GOOGLE_GENERATIVE_AI_API_KEY is not set"
                        .to_string(),
                ));
            }
            let client = GeminiClient::new().map_err(|e| {
                ProviderError::ConfigError(format!("Failed to create Gemini client: {e}"))
            })?;
            log::info!("Initialized Gemini provider");
            ALWAYS_USE_REALTIME
                .set(always_realtime_env || !client.supports_batch())
                .map_err(|e| {
                    ProviderError::ConfigError(format!(
                        "Failed to update global provider config. Trying to overwrite provider. Existing supports_batch: {e}",
                    ))
                })?;
            Ok(ProviderClient::Gemini(client))
        }
        "bedrock" => {
            if !has_bedrock_credentials() {
                return Err(ProviderError::ConfigError(
                    "Provider resolved to 'bedrock' but one or more required AWS env vars are missing (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)".to_string(),
                ));
            }
            let client = BedrockClient::new().await?;
            log::info!("Initialized Bedrock provider");
            ALWAYS_USE_REALTIME
                .set(always_realtime_env || !client.supports_batch())
                .map_err(|e| {
                    ProviderError::ConfigError(format!(
                        "Failed to update global provider config. Trying to overwrite provider. Existing supports_batch: {e}",
                    ))
                })?;
            Ok(ProviderClient::Bedrock(client))
        }
        other => Err(ProviderError::ConfigError(format!(
            "Unknown provider: '{other}'. Supported providers: gemini, bedrock",
        ))),
    }
}
