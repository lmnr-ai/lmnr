pub mod bedrock;
pub mod gemini;
pub mod mock;
pub mod models;
pub mod openai;

pub use bedrock::BedrockClient;
pub use gemini::GeminiClient;
pub use mock::MockProviderClient;
pub use models::*;
pub use openai::OpenAIClient;

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
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
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
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    pub fn is_retryable(&self) -> bool {
        match self {
            ProviderError::ApiError { retryable, .. } => *retryable,
            ProviderError::RequestError(_) => true,
            _ => false,
        }
    }

    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
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

    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
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

    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
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
    OpenAI(OpenAIClient),
    Mock(MockProviderClient),
}

static ALWAYS_USE_REALTIME: OnceLock<bool> = OnceLock::new();

#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub fn always_use_realtime() -> bool {
    *ALWAYS_USE_REALTIME.get().unwrap_or(&false)
}

/// Read and normalize `LLM_PROVIDER` (lowercased + trimmed). Empty string
/// when unset; callers that require it should use [`resolve_provider_name`].
pub fn llm_provider_env() -> String {
    env::var("LLM_PROVIDER")
        .ok()
        .map(|v| v.trim().to_lowercase())
        .unwrap_or_default()
}

/// `LLM_API_KEY` is the single key shared by single-key providers (gemini,
/// openai). It belongs to whichever provider `LLM_PROVIDER` names — gemini
/// and openai cannot both initialize from it.
fn has_llm_api_key() -> bool {
    env::var("LLM_API_KEY").is_ok_and(|v| !v.is_empty())
}

/// True when `LLM_PROVIDER=gemini` and `LLM_API_KEY` is set.
fn has_gemini_credentials() -> bool {
    llm_provider_env() == "gemini" && has_llm_api_key()
}

/// True when `LLM_PROVIDER=openai` and `LLM_API_KEY` is set.
fn has_openai_credentials() -> bool {
    llm_provider_env() == "openai" && has_llm_api_key()
}

/// Bedrock initializes whenever AWS creds are present, independent of
/// `LLM_PROVIDER`. This preserves the cloud setup where gemini is primary
/// and bedrock is a "sometimes pinned" secondary.
fn has_bedrock_credentials() -> bool {
    env::var("AWS_ACCESS_KEY_ID").is_ok_and(|v| !v.is_empty())
        && env::var("AWS_SECRET_ACCESS_KEY").is_ok_and(|v| !v.is_empty())
        && env::var("AWS_REGION").is_ok_and(|v| !v.is_empty())
}

/// Resolve the primary provider name from `LLM_PROVIDER`. Required —
/// returns `ConfigError` when missing/empty.
pub(crate) fn resolve_provider_name() -> Result<String, ProviderError> {
    let name = llm_provider_env();
    if name.is_empty() {
        return Err(ProviderError::ConfigError(
            "LLM_PROVIDER environment variable is required".to_string(),
        ));
    }
    Ok(name)
}

/// Build the span input value from a [`ProviderRequest`] by combining
/// `contents` with `system_instruction` (relabeled as role `"system"`)
/// prepended. Used by callers that emit observability spans for an
/// LLM call (signals worker, preview pipelines).
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub fn request_to_span_input(request: &ProviderRequest) -> serde_json::Value {
    let mut contents = request.contents.clone();
    if let Some(mut sys) = request.system_instruction.clone() {
        sys.role = Some("system".to_string());
        contents.insert(0, sys);
    }
    serde_json::json!(contents)
}

/// Convert [`ProviderRequest`] tools into the `ai.prompt.tools`
/// attribute format expected by the trace UI.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub fn request_to_tools_attr(request: &ProviderRequest) -> Option<serde_json::Value> {
    let tools = request.tools.as_ref()?;
    let tool_array: Vec<serde_json::Value> = tools
        .iter()
        .flat_map(|t| &t.function_declarations)
        .map(|f| {
            serde_json::json!({
                "type": "function",
                "name": f.name,
                "description": f.description,
                "parameters": f.parameters,
            })
        })
        .collect();
    if tool_array.is_empty() {
        None
    } else {
        Some(serde_json::Value::Array(tool_array))
    }
}

/// Resolve a model id for `(provider, size)`. When `provider` equals the
/// `LLM_PROVIDER` env var, `LLM_MODEL_<SIZE>` overrides win; otherwise
/// (cross-provider pinned calls) we use the hardcoded fallback table so
/// users can't accidentally send e.g. a gemini model id to bedrock.
pub fn model_for_size(provider: &str, size: ModelSize) -> String {
    if provider == llm_provider_env() {
        let env_key = match size {
            ModelSize::Small => "LLM_MODEL_SMALL",
            ModelSize::Medium => "LLM_MODEL_MEDIUM",
            ModelSize::Large => "LLM_MODEL_LARGE",
        };
        if let Ok(v) = env::var(env_key) {
            let v = v.trim();
            if !v.is_empty() {
                return v.to_string();
            }
        }
    }

    match (provider, size) {
        ("gemini", ModelSize::Small) => "gemini-3-flash-preview".to_string(),
        ("gemini", ModelSize::Medium) => "gemini-3-flash-preview".to_string(),
        ("gemini", ModelSize::Large) => "gemini-3-pro-preview".to_string(),
        ("bedrock", ModelSize::Small) => "us.anthropic.claude-haiku-4-5-20251001-v1:0".to_string(),
        ("bedrock", ModelSize::Medium) => "us.anthropic.claude-sonnet-4-6".to_string(),
        ("bedrock", ModelSize::Large) => "us.anthropic.claude-opus-4-7".to_string(),
        ("openai", ModelSize::Small) => "gpt-5-mini".to_string(),
        ("openai", ModelSize::Medium) => "gpt-5".to_string(),
        ("openai", ModelSize::Large) => "gpt-5".to_string(),
        _ => "".to_string(),
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
}

impl LlmClient {
    pub async fn new() -> Result<Self, ProviderError> {
        let default_provider = resolve_provider_name()?;

        let mut providers = HashMap::new();

        if has_gemini_credentials() {
            let client = GeminiClient::new().map_err(|e| {
                ProviderError::ConfigError(format!("Failed to create Gemini client: {e}"))
            })?;
            log::info!("Initialized Gemini provider at {}", client.api_base_url());
            providers.insert("gemini".to_string(), ProviderClient::Gemini(client));
        }

        if has_bedrock_credentials() {
            let client = BedrockClient::new().await?;
            log::info!("Initialized Bedrock provider");
            providers.insert("bedrock".to_string(), ProviderClient::Bedrock(client));
        }

        if has_openai_credentials() {
            let client = OpenAIClient::new().map_err(|e| {
                ProviderError::ConfigError(format!("Failed to create OpenAI client: {e}"))
            })?;
            log::info!("Initialized OpenAI provider at {}", client.api_base_url());
            providers.insert("openai".to_string(), ProviderClient::OpenAI(client));
        }

        if default_provider == "mock" {
            let client = MockProviderClient::new();
            log::info!("Initialized Mock provider");
            providers.insert("mock".to_string(), ProviderClient::Mock(client));
        }

        if !providers.contains_key(&default_provider) {
            return Err(ProviderError::ConfigError(format!(
                "LLM_PROVIDER='{}' could not be initialized (missing credentials?)",
                default_provider
            )));
        }

        finalize_client(providers.get(&default_provider).unwrap())?;

        Ok(Self {
            providers,
            default_provider,
        })
    }

    /// Build an `LlmClient` directly from a `ProviderClient` for tests.
    #[cfg(test)]
    pub fn from_provider(name: &str, client: ProviderClient) -> Self {
        let mut providers = HashMap::new();
        providers.insert(name.to_string(), client);
        Self {
            providers,
            default_provider: name.to_string(),
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
        } else if let Some(c) = self.providers.get(&self.default_provider) {
            // Silent fallback. OSS deployments with a single registered
            // provider will hit this on every cloud-pinned call (e.g.
            // `provider: Some("bedrock")` while LLM_PROVIDER=openai),
            // which is expected and not worth warning about.
            (self.default_provider.as_str(), c)
        } else {
            return Err(ProviderError::ConfigError(format!(
                "Provider '{}' not available and default '{}' also missing. Available: {:?}",
                provider_name,
                self.default_provider,
                self.providers.keys().collect::<Vec<_>>()
            )));
        };
        let size = request.model_size.unwrap_or(ModelSize::Medium);
        let model = model_for_size(resolved_provider, size);
        Ok((client, model))
    }

    pub async fn generate_content(
        &self,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        let (client, model) = self.resolve(request)?;
        client.generate_content(&model, request).await
    }

    /// Resolve `(model, provider)` strings for `request` without firing
    /// the call. Used by callers that record the resolved model/provider
    /// in side-channel observability spans before/after `generate_content`.
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    pub fn resolve_model_provider(&self, request: &ProviderRequest) -> (String, String) {
        let provider_name = request
            .provider
            .as_deref()
            .unwrap_or(&self.default_provider);
        let resolved_provider = if self.providers.contains_key(provider_name) {
            provider_name
        } else {
            self.default_provider.as_str()
        };
        let size = request.model_size.unwrap_or(ModelSize::Medium);
        let model = model_for_size(resolved_provider, size);
        (model, resolved_provider.to_string())
    }

    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
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
                    model_for_size(&self.default_provider, ModelSize::Medium),
                )
            });
        client.create_batch(&model, requests, display_name).await
    }

    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    pub async fn get_batch(&self, batch_name: &str) -> ProviderResult<ProviderBatchOperation> {
        // TODO: Implement batch retrieval for all providers
        let client = self.providers.get(&self.default_provider).unwrap();
        client.get_batch(batch_name).await
    }
}
