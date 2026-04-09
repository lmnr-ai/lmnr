pub mod bedrock;
pub mod gemini;
pub mod mock;
pub mod models;

pub use bedrock::BedrockClient;
pub use gemini::GeminiClient;
pub use mock::MockProviderClient;
pub use models::*;

use enum_dispatch::enum_dispatch;
use std::collections::HashMap;
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
pub(crate) trait LanguageModelClient: Send + Sync {
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
pub(crate) enum ProviderClient {
    Gemini(GeminiClient),
    Bedrock(BedrockClient),
    Mock(MockProviderClient),
}

static ALWAYS_USE_REALTIME: OnceLock<bool> = OnceLock::new();

pub fn always_use_realtime() -> bool {
    *ALWAYS_USE_REALTIME.get().unwrap_or(&false)
}

/// Checks whether the required environment variables are set for the Gemini provider.
fn has_gemini_credentials() -> bool {
    env::var("GOOGLE_GENERATIVE_AI_API_KEY").is_ok_and(|v| !v.is_empty())
}

/// Checks whether the required environment variables are set for the Bedrock provider.
fn has_bedrock_credentials() -> bool {
    env::var("AWS_ACCESS_KEY_ID").is_ok_and(|v| !v.is_empty())
        && env::var("AWS_SECRET_ACCESS_KEY").is_ok_and(|v| !v.is_empty())
        && env::var("AWS_REGION").is_ok_and(|v| !v.is_empty())
}

/// Resolve the provider name from env var or credential auto-detection.
pub(crate) fn resolve_provider_name() -> String {
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
pub(crate) fn default_model_for_provider(provider: &str) -> String {
    match provider {
        "mock" => "".to_string(),
        "bedrock" => "us.anthropic.claude-sonnet-4-6".to_string(),
        _ => "gemini-3-flash-preview".to_string(),
    }
}

/// Map a (provider, model size) pair to a concrete model ID.
pub fn model_for_size(provider: &str, size: ModelSize) -> String {
    match (provider, size) {
        ("gemini", ModelSize::Small) => "gemini-3-flash-preview".to_string(),
        ("gemini", ModelSize::Medium) => "gemini-3-flash-preview".to_string(),
        ("gemini", ModelSize::Large) => "gemini-3-pro-preview".to_string(),
        ("bedrock", ModelSize::Small) => "us.anthropic.claude-haiku-4-5-20251001-v1:0".to_string(),
        ("bedrock", ModelSize::Medium) => "us.anthropic.claude-sonnet-4-6".to_string(),
        ("bedrock", ModelSize::Large) => "us.anthropic.claude-opus-4-6-v1".to_string(),
        _ => default_model_for_provider(provider),
    }
}

fn finalize_client(client: &ProviderClient) -> Result<(), ProviderError> {
    let always_realtime_env = std::env::var("SIGNALS_ALWAYS_USE_REALTIME")
        .is_ok_and(|v| v.trim().to_lowercase() == "true");
    ALWAYS_USE_REALTIME
        .set(always_realtime_env || !client.supports_batch())
        .map_err(|e| {
            ProviderError::ConfigError(format!(
                "Failed to update global provider config. Trying to overwrite provider. Existing supports_batch: {e}",
            ))
        })
}

/// LLM client that holds all available provider clients and multiplexes
/// requests based on optional `provider` and `model_size` fields on
/// [`ProviderRequest`]. Callers never deal with provider resolution --
/// they just call `generate_content(&request)`.
#[derive(Clone)]
pub struct LlmClient {
    providers: HashMap<String, ProviderClient>,
    default_provider: String,
    default_model: String,
}

impl LlmClient {
    pub async fn new() -> Result<Self, ProviderError> {
        let default_provider = resolve_provider_name();
        let default_model = env::var("SIGNALS_LLM_MODEL")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| default_model_for_provider(&default_provider));

        let mut providers = HashMap::new();

        if has_gemini_credentials() {
            let client = GeminiClient::new().map_err(|e| {
                ProviderError::ConfigError(format!("Failed to create Gemini client: {e}"))
            })?;
            log::info!("Initialized Gemini provider");
            providers.insert("gemini".to_string(), ProviderClient::Gemini(client));
        }

        if has_bedrock_credentials() {
            let client = BedrockClient::new().await?;
            log::info!("Initialized Bedrock provider");
            providers.insert("bedrock".to_string(), ProviderClient::Bedrock(client));
        }

        if default_provider == "mock" {
            let client = MockProviderClient::new();
            log::info!("Initialized Mock provider");
            providers.insert("mock".to_string(), ProviderClient::Mock(client));
        }

        if !providers.contains_key(&default_provider) {
            return Err(ProviderError::ConfigError(format!(
                "Default provider '{}' could not be initialized (missing credentials?)",
                default_provider
            )));
        }

        finalize_client(providers.get(&default_provider).unwrap())?;

        Ok(Self {
            providers,
            default_provider,
            default_model,
        })
    }

    /// Build an `LlmClient` directly from a `ProviderClient` for tests.
    #[cfg(test)]
    pub fn from_provider(name: &str, client: ProviderClient) -> Self {
        let default_model = default_model_for_provider(name);
        let mut providers = HashMap::new();
        providers.insert(name.to_string(), client);
        Self {
            providers,
            default_provider: name.to_string(),
            default_model,
        }
    }

    fn resolve(
        &self,
        request: &ProviderRequest,
    ) -> Result<(&ProviderClient, String), ProviderError> {
        let provider_name = request
            .provider
            .as_deref()
            .unwrap_or(&self.default_provider);
        let (resolved_provider, client) = if let Some(c) = self.providers.get(provider_name) {
            (provider_name, c)
        } else if request.provider.is_some() {
            // If the provider was explicitly requested, don't fall back to the default.
            // Callers like filter.rs depend on specific provider capabilities (e.g. extended
            // thinking, caching) that may not be available on the default provider.
            return Err(ProviderError::ConfigError(format!(
                "Provider '{}' not available. Available: {:?}",
                provider_name,
                self.providers.keys().collect::<Vec<_>>()
            )));
        } else if let Some(c) = self.providers.get(&self.default_provider) {
            log::warn!(
                "Provider '{}' not available, falling back to default '{}'",
                provider_name,
                self.default_provider,
            );
            (self.default_provider.as_str(), c)
        } else {
            return Err(ProviderError::ConfigError(format!(
                "Provider '{}' not available and default '{}' also missing. Available: {:?}",
                provider_name,
                self.default_provider,
                self.providers.keys().collect::<Vec<_>>()
            )));
        };
        let model = match request.model_size {
            Some(size) => model_for_size(resolved_provider, size),
            None => self.default_model.clone(),
        };
        Ok((client, model))
    }

    pub async fn generate_content(
        &self,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        let (client, model) = self.resolve(request)?;
        client.generate_content(&model, request).await
    }

    pub async fn create_batch(
        &self,
        requests: Vec<ProviderRequestItem>,
        display_name: Option<String>,
    ) -> ProviderResult<ProviderBatchOperation> {
        let (client, model) = requests
            .first()
            .map(|r| self.resolve(&r.request))
            .transpose()?
            .unwrap_or_else(|| {
                (
                    self.providers.get(&self.default_provider).unwrap(),
                    self.default_model.clone(),
                )
            });
        client.create_batch(&model, requests, display_name).await
    }

    pub async fn get_batch(&self, batch_name: &str) -> ProviderResult<ProviderBatchOperation> {
        // TODO: Implement batch retrieval for all providers
        let client = self.providers.get(&self.default_provider).unwrap();
        client.get_batch(batch_name).await
    }
}
