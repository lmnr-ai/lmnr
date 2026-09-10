pub(crate) mod azure;
pub mod azure_anthropic;
pub mod bedrock;
pub mod gemini;
pub mod mock;
pub mod models;
pub mod openai;
pub mod openai_responses;
pub mod profiles;
pub(crate) mod sse;

pub use azure_anthropic::AzureAnthropicClient;
pub use bedrock::BedrockClient;
pub use gemini::GeminiClient;
pub use mock::MockProviderClient;
pub use models::*;
pub use openai::OpenAIClient;
pub use openai_responses::OpenAIResponsesClient;

use enum_dispatch::enum_dispatch;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use thiserror::Error;
use tokio::sync::mpsc::UnboundedSender;
use uuid::Uuid;

use crate::env;

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("Request failed: {0}")]
    RequestError(String),
    #[error("Failed to parse response: {0}")]
    ParseError(String),
    #[error("Configuration error: {0}")]
    ConfigError(String),
    // Constructed only by the (currently unused) batch API default impls.
    #[error("Not supported: {0}")]
    #[allow(dead_code)]
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

    #[allow(dead_code)]
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

/// Walks the `source()` chain — `reqwest::Error`'s `Display` drops the
/// underlying cause (connection reset, TLS/DNS failure, timeout).
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub(crate) fn format_error_chain(err: &(dyn std::error::Error + 'static)) -> String {
    let mut out = err.to_string();
    let mut source = err.source();
    while let Some(cause) = source {
        out.push_str(": ");
        out.push_str(&cause.to_string());
        source = cause.source();
    }
    out
}

#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub(crate) fn emit_response_as_chunks(
    response: &ProviderResponse,
    chunk_tx: &UnboundedSender<ProviderStreamChunk>,
) {
    let Some(parts) = response
        .candidates
        .as_ref()
        .and_then(|c| c.first())
        .and_then(|c| c.content.as_ref())
        .and_then(|content| content.parts.as_ref())
    else {
        return;
    };
    for part in parts {
        let Some(text) = part.text.as_ref().filter(|t| !t.is_empty()) else {
            continue;
        };
        let chunk = if part.thought == Some(true) {
            ProviderStreamChunk::Thought(text.clone())
        } else {
            ProviderStreamChunk::Text(text.clone())
        };
        let _ = chunk_tx.send(chunk);
    }
}

#[enum_dispatch]
pub(crate) trait LanguageModelClient: Send + Sync {
    async fn generate_content(
        &self,
        model: &str,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse>;

    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    async fn generate_content_stream(
        &self,
        model: &str,
        request: &ProviderRequest,
        chunk_tx: &UnboundedSender<ProviderStreamChunk>,
    ) -> ProviderResult<ProviderResponse> {
        let response = self.generate_content(model, request).await?;
        emit_response_as_chunks(&response, chunk_tx);
        Ok(response)
    }

    // Batch API — currently has no callers; kept for future batch workloads.
    #[allow(dead_code)]
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

    #[allow(dead_code)]
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
    AzureAnthropic(AzureAnthropicClient),
    OpenAI(OpenAIClient),
    OpenAIResponses(OpenAIResponsesClient),
    Mock(MockProviderClient),
}

const LLM_DEFAULT_HEADERS_JSON_ENV: &str = env::llm::DEFAULT_HEADERS_JSON;

/// Whether the shared `LlmClient` actually initialized. Set from `main.rs`
/// after client construction. Feature flags (e.g. `Feature::UserTaskExtraction`,
/// `Feature::Signals`) only mirror the credential env vars, but `LlmClient::new`
/// can still fail (bad `LLM_DEFAULT_HEADERS_JSON`, HTTP client build error, ...)
/// — and when it does, the LLM-backed workers are never spawned, so enqueueing
/// would strand messages on their queues unconsumed. Defaults to false so paths
/// that never call `set_llm_client_available` (tests) don't enqueue.
static LLM_CLIENT_AVAILABLE: OnceLock<bool> = OnceLock::new();

/// Called once from `main.rs` right after `LlmClient` construction.
/// First call wins (`OnceLock`); until then the LLM-backed producer hooks
/// treat the client as unavailable and never enqueue.
pub fn set_llm_client_available(available: bool) {
    let _ = LLM_CLIENT_AVAILABLE.set(available);
}

/// Whether the shared `LlmClient` initialized. Every LLM-backed producer hook
/// (user-task extraction, static-prompt extraction) gates on this.
pub fn llm_client_available() -> bool {
    LLM_CLIENT_AVAILABLE.get().copied().unwrap_or(false)
}

/// Read and normalize `LLM_PROVIDER` (lowercased + trimmed). Empty string
/// when unset; callers that require it should use [`resolve_provider_name`].
pub fn llm_provider_env() -> String {
    std::env::var(env::llm::PROVIDER)
        .ok()
        .map(|v| v.trim().to_lowercase())
        .unwrap_or_default()
}

/// Provider for the auxiliary "parsing" LLM calls
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub fn parsing_provider() -> Option<String> {
    std::env::var(env::llm::PARSING_PROVIDER)
        .ok()
        .map(|v| v.trim().to_lowercase())
        .filter(|v| !v.is_empty())
}

/// `LLM_API_KEY` is the single key shared by single-key providers (gemini,
/// openai, azure_*). It belongs to whichever provider `LLM_PROVIDER` names —
/// gemini and openai cannot both initialize from it.
fn has_llm_api_key() -> bool {
    std::env::var(env::llm::API_KEY).is_ok_and(|v| !v.is_empty())
}

/// True when `LLM_PROVIDER` names the given Azure provider and both the key and an
/// endpoint are set. All three share one resource, so only the name differs.
fn has_azure_credentials(provider: &str) -> bool {
    llm_provider_env() == provider && has_llm_api_key() && azure::has_endpoint()
}

/// True when `LLM_PROVIDER=gemini` and `LLM_API_KEY` is set.
fn has_gemini_credentials() -> bool {
    llm_provider_env() == "gemini" && has_llm_api_key()
}

/// True when `LLM_PROVIDER=openai` (Chat Completions) and `LLM_API_KEY` is set.
fn has_openai_credentials() -> bool {
    llm_provider_env() == "openai" && has_llm_api_key()
}

/// True when `LLM_PROVIDER=openai_responses` (Responses API) and `LLM_API_KEY`
/// is set. Separate from `has_openai_credentials` since the two are distinct
/// client impls registered under their own provider names.
fn has_openai_responses_credentials() -> bool {
    llm_provider_env() == "openai_responses" && has_llm_api_key()
}

/// Bedrock initializes whenever AWS creds are present, independent of
/// `LLM_PROVIDER`. This preserves the cloud setup where gemini is primary
/// and bedrock is a "sometimes pinned" secondary.
fn has_bedrock_credentials() -> bool {
    std::env::var(env::secrets::AWS_ACCESS_KEY_ID).is_ok_and(|v| !v.is_empty())
        && std::env::var(env::secrets::AWS_SECRET_ACCESS_KEY).is_ok_and(|v| !v.is_empty())
        && std::env::var(env::secrets::AWS_REGION).is_ok_and(|v| !v.is_empty())
}

pub(crate) fn default_headers_from_env() -> Result<HeaderMap, String> {
    let Some(raw_headers) = std::env::var(LLM_DEFAULT_HEADERS_JSON_ENV)
        .ok()
        .filter(|s| !s.trim().is_empty())
    else {
        return Ok(HeaderMap::new());
    };

    parse_default_headers_json(&raw_headers)
        .map_err(|e| format!("{LLM_DEFAULT_HEADERS_JSON_ENV}: {e}"))
}

fn parse_default_headers_json(raw_headers: &str) -> Result<HeaderMap, String> {
    let parsed: serde_json::Value = serde_json::from_str(raw_headers)
        .map_err(|e| format!("must be a JSON object with string values: {e}"))?;
    let object = parsed
        .as_object()
        .ok_or_else(|| "must be a JSON object with string values".to_string())?;

    let mut headers = HeaderMap::new();
    for (name, value) in object {
        let value = value
            .as_str()
            .ok_or_else(|| format!("header '{name}' value must be a string"))?;
        let name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|e| format!("invalid header name '{name}': {e}"))?;
        let value = HeaderValue::from_str(value)
            .map_err(|e| format!("invalid value for header '{name}': {e}"))?;
        headers.insert(name, value);
    }

    Ok(headers)
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
/// LLM call (signals worker, preview pipelines, system_extraction).
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

/// Run `f` with `vars` set, restoring the previous values afterwards. Provider
/// clients resolve their endpoint and auth from process-global env at
/// construction, and several of them read the same `LLM_API_KEY`, so those
/// tests would clobber each other if they ran concurrently — the lock
/// serializes them.
#[cfg(test)]
pub(crate) fn with_env_vars<T>(vars: &[(&str, &str)], f: impl FnOnce() -> T) -> T {
    static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let previous: Vec<_> = vars
        .iter()
        .map(|(name, _)| (*name, std::env::var(name).ok()))
        .collect();
    unsafe {
        for (name, value) in vars {
            std::env::set_var(name, value);
        }
    }

    let out = f();

    unsafe {
        for (name, value) in previous {
            match value {
                Some(value) => std::env::set_var(name, value),
                None => std::env::remove_var(name),
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_default_headers_json_accepts_string_map() {
        let headers = parse_default_headers_json(
            r#"{"X-Gateway-Tenant":"brex","anthropic-version":"2023-06-01"}"#,
        )
        .unwrap();

        assert_eq!(
            headers.get("x-gateway-tenant").unwrap().to_str().unwrap(),
            "brex"
        );
        assert_eq!(
            headers.get("anthropic-version").unwrap().to_str().unwrap(),
            "2023-06-01"
        );
    }

    #[test]
    fn parse_default_headers_json_rejects_non_object() {
        let error = parse_default_headers_json(r#"["x"]"#).unwrap_err();
        assert!(error.contains("must be a JSON object"));
    }

    #[test]
    fn parse_default_headers_json_rejects_non_string_values() {
        let error = parse_default_headers_json(r#"{"X-Gateway-Tenant":true}"#).unwrap_err();
        assert!(error.contains("value must be a string"));
    }

    #[test]
    fn parse_default_headers_json_rejects_invalid_names() {
        let error = parse_default_headers_json(r#"{"Bad Header":"value"}"#).unwrap_err();
        assert!(error.contains("invalid header name"));
    }

    #[test]
    fn parse_default_headers_json_rejects_invalid_values() {
        let error =
            parse_default_headers_json("{\"X-Gateway-Tenant\":\"bad\\nvalue\"}").unwrap_err();
        assert!(error.contains("invalid value"));
    }
}

/// Resolve a model id for `(provider, size)`. When `provider` equals the
/// `LLM_PROVIDER` env var, `LLM_MODEL_<SIZE>` overrides win; otherwise
/// (cross-provider pinned calls) we use the hardcoded fallback table so
/// users can't accidentally send e.g. a gemini model id to bedrock.
pub fn model_for_size(provider: &str, size: ModelSize) -> String {
    if provider == llm_provider_env() {
        let env_key = match size {
            ModelSize::Small => env::llm::MODEL_SMALL,
            ModelSize::Medium => env::llm::MODEL_MEDIUM,
            ModelSize::Large => env::llm::MODEL_LARGE,
        };
        if let Ok(v) = std::env::var(env_key) {
            let v = v.trim();
            if !v.is_empty() {
                return v.to_string();
            }
        }
    }

    match (provider, size) {
        ("gemini", ModelSize::Small) => "gemini-3.5-flash-lite".to_string(),
        ("gemini", ModelSize::Medium) => "gemini-3-flash-preview".to_string(),
        ("gemini", ModelSize::Large) => "gemini-3.1-pro-preview".to_string(),
        ("bedrock", ModelSize::Small) => "us.anthropic.claude-haiku-4-5-20251001-v1:0".to_string(),
        ("bedrock", ModelSize::Medium) => "us.anthropic.claude-sonnet-5".to_string(),
        ("bedrock", ModelSize::Large) => "us.anthropic.claude-opus-5".to_string(),
        // Azure model ids are deployment names; Azure's portal defaults each
        // deployment to the bare model name, which is also what the
        // adaptive-thinking gates in `bedrock::build_request_body` match on.
        ("azure_anthropic", ModelSize::Small) => "claude-haiku-4-5".to_string(),
        ("azure_anthropic", ModelSize::Medium) => "claude-sonnet-5".to_string(),
        ("azure_anthropic", ModelSize::Large) => "claude-opus-5".to_string(),
        (
            "openai" | "openai_responses" | "azure_chat_completions" | "azure_responses",
            ModelSize::Small,
        ) => "gpt-5.6-luna".to_string(),
        (
            "openai" | "openai_responses" | "azure_chat_completions" | "azure_responses",
            ModelSize::Medium,
        ) => "gpt-5.6-terra".to_string(),
        (
            "openai" | "openai_responses" | "azure_chat_completions" | "azure_responses",
            ModelSize::Large,
        ) => "gpt-5.6-sol".to_string(),
        _ => "".to_string(),
    }
}

/// LLM client that holds all available provider clients and multiplexes
/// requests based on optional `provider` and `model_size` fields on
/// [`ProviderRequest`]. Callers never deal with provider resolution --
/// they just call `generate_content(&request)`.
#[derive(Clone)]
pub struct LlmClient {
    providers: HashMap<String, Arc<ProviderClient>>,
    /// `LLM_PROVIDER`. `None` only when the deployment runs signals purely on
    /// LLM profiles (self-hosted, no env credentials).
    default_provider: Option<String>,
    profiles: Option<Arc<profiles::LlmProfileStore>>,
}

/// Where a request's model + client come from after resolution.
/// Model name and reported provider (a `model_costs` provider prefix) a request
/// resolves to, as recorded on observability spans. Empty when unresolvable.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ModelProvider {
    pub model: String,
    pub provider: String,
}

enum Resolved {
    Env {
        client: Arc<ProviderClient>,
        provider: String,
        model: String,
    },
    Profile {
        client: Arc<ProviderClient>,
        reported_provider: &'static str,
        model: String,
    },
}

impl Resolved {
    fn client(&self) -> &Arc<ProviderClient> {
        match self {
            Self::Env { client, .. } | Self::Profile { client, .. } => client,
        }
    }

    fn model(&self) -> &str {
        match self {
            Self::Env { model, .. } | Self::Profile { model, .. } => model,
        }
    }

    fn provider(&self) -> &str {
        match self {
            Self::Env { provider, .. } => provider,
            Self::Profile {
                reported_provider, ..
            } => reported_provider,
        }
    }

    /// Provider clients return errors without logging so direct callers (the
    /// profile "test connection" probe) stay silent; pipeline calls log here.
    /// Capacity errors we can't act on stay out of error monitoring: 503 is
    /// `warn`, and flex-tier 429/503 is `debug` since the tier retries and
    /// falls back to standard on its own.
    fn log_error(&self, request: &ProviderRequest, e: &ProviderError) {
        let is_flex = request.service_tier.as_deref() == Some(gemini::FLEX_SERVICE_TIER);
        let status = match e {
            ProviderError::ApiError { status_code, .. } => Some(*status_code),
            _ => None,
        };
        let msg = format!(
            "LLM call failed [{} / {}]: {e}",
            self.provider(),
            self.model()
        );
        match status {
            Some(429 | 503) if is_flex => log::debug!("{msg} [flex]"),
            Some(503) => log::warn!("{msg}"),
            _ => log::error!("{msg}"),
        }
    }
}

impl LlmClient {
    /// Builds every env-configured provider. When `profiles` is set and
    /// `LLM_PROVIDER` is unset, construction still succeeds with zero env
    /// providers: profile-routed requests work, env-routed ones fail per call.
    pub async fn new(
        profiles: Option<Arc<profiles::LlmProfileStore>>,
    ) -> Result<Self, ProviderError> {
        let default_provider = match resolve_provider_name() {
            Ok(name) => Some(name),
            Err(_) if profiles.is_some() => None,
            Err(e) => return Err(e),
        };

        let mut providers: HashMap<String, Arc<ProviderClient>> = HashMap::new();

        if has_gemini_credentials() {
            let client = GeminiClient::new().map_err(|e| {
                ProviderError::ConfigError(format!("Failed to create Gemini client: {e}"))
            })?;
            log::info!("Initialized Gemini provider at {}", client.api_base_url());
            providers.insert(
                "gemini".to_string(),
                Arc::new(ProviderClient::Gemini(client)),
            );
        }

        if has_bedrock_credentials() {
            let client = BedrockClient::new().await?;
            log::info!("Initialized Bedrock provider");
            providers.insert(
                "bedrock".to_string(),
                Arc::new(ProviderClient::Bedrock(client)),
            );
        }

        if has_openai_credentials() {
            let client = OpenAIClient::new().map_err(|e| {
                ProviderError::ConfigError(format!("Failed to create OpenAI client: {e}"))
            })?;
            log::info!(
                "Initialized OpenAI provider (Chat Completions) at {}",
                client.api_base_url()
            );
            providers.insert(
                "openai".to_string(),
                Arc::new(ProviderClient::OpenAI(client)),
            );
        }

        if has_openai_responses_credentials() {
            let client = OpenAIResponsesClient::new().map_err(|e| {
                ProviderError::ConfigError(format!("Failed to create OpenAI Responses client: {e}"))
            })?;
            log::info!(
                "Initialized OpenAI provider (Responses API) at {}",
                client.api_base_url()
            );
            providers.insert(
                "openai_responses".to_string(),
                Arc::new(ProviderClient::OpenAIResponses(client)),
            );
        }

        if has_azure_credentials("azure_chat_completions") {
            let client = OpenAIClient::azure().map_err(|e| {
                ProviderError::ConfigError(format!("Failed to create Azure client: {e}"))
            })?;
            log::info!(
                "Initialized Azure provider (Chat Completions) at {}",
                client.api_base_url()
            );
            providers.insert(
                "azure_chat_completions".to_string(),
                Arc::new(ProviderClient::OpenAI(client)),
            );
        }

        if has_azure_credentials("azure_responses") {
            let client = OpenAIResponsesClient::azure().map_err(|e| {
                ProviderError::ConfigError(format!("Failed to create Azure Responses client: {e}"))
            })?;
            log::info!(
                "Initialized Azure provider (Responses API) at {}",
                client.api_base_url()
            );
            providers.insert(
                "azure_responses".to_string(),
                Arc::new(ProviderClient::OpenAIResponses(client)),
            );
        }

        if has_azure_credentials("azure_anthropic") {
            let client = AzureAnthropicClient::new()?;
            log::info!(
                "Initialized Azure provider (Anthropic Messages) at {}",
                client.api_base_url()
            );
            providers.insert(
                "azure_anthropic".to_string(),
                Arc::new(ProviderClient::AzureAnthropic(client)),
            );
        }

        if default_provider.as_deref() == Some("mock") {
            let client = MockProviderClient::new();
            log::info!("Initialized Mock provider");
            providers.insert("mock".to_string(), Arc::new(ProviderClient::Mock(client)));
        }

        if let Some(name) = &default_provider
            && !providers.contains_key(name)
        {
            return Err(ProviderError::ConfigError(format!(
                "LLM_PROVIDER='{}' could not be initialized (missing credentials?)",
                name
            )));
        }
        if default_provider.is_none() {
            log::info!("LLM_PROVIDER unset; signals run on workspace LLM profiles only");
        }

        Ok(Self {
            providers,
            default_provider,
            profiles,
        })
    }

    /// Build an `LlmClient` directly from a `ProviderClient` for tests.
    #[cfg(test)]
    pub fn from_provider(name: &str, client: ProviderClient) -> Self {
        let mut providers = HashMap::new();
        providers.insert(name.to_string(), Arc::new(client));
        Self {
            providers,
            default_provider: Some(name.to_string()),
            profiles: None,
        }
    }

    /// Env-side resolution: the pinned `provider` when registered, else the
    /// `LLM_PROVIDER` default. Errors when neither exists — on a profile-only
    /// deployment that means the request forgot its `llm_profile` route.
    fn resolve_env_provider(
        &self,
        request: &ProviderRequest,
    ) -> Result<(String, Arc<ProviderClient>), ProviderError> {
        let default = self.default_provider.as_deref();
        let requested = request.provider.as_deref().or(default);
        if let Some(name) = requested
            && let Some(client) = self.providers.get(name)
        {
            return Ok((name.to_string(), client.clone()));
        }
        // Silent fallback. OSS deployments with a single registered
        // provider will hit this on every cloud-pinned call (e.g.
        // `provider: Some("bedrock")` while LLM_PROVIDER=openai),
        // which is expected and not worth warning about.
        if let Some(name) = default
            && let Some(client) = self.providers.get(name)
        {
            return Ok((name.to_string(), client.clone()));
        }
        match default {
            Some(default) => Err(ProviderError::ConfigError(format!(
                "Provider '{}' not available and default '{}' also missing. Available: {:?}",
                requested.unwrap_or(default),
                default,
                self.providers.keys().collect::<Vec<_>>()
            ))),
            None => Err(ProviderError::ConfigError(
                "No LLM configured for this signal — select an LLM profile (LLM_PROVIDER is unset)"
                    .to_string(),
            )),
        }
    }

    /// Validates a route the way a call would (profile exists, belongs to the
    /// route's project workspace, lists the model, client builds).
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    pub async fn check_profile_route(
        &self,
        route: &profiles::LlmProfileRoute,
    ) -> Result<(), ProviderError> {
        self.profile_store()?.resolve(route).await.map(|_| ())
    }

    /// Profile name for labels; `None` when profiles are off or the row is gone.
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    pub async fn describe_profile(&self, project_id: Uuid, profile_id: Uuid) -> Option<String> {
        let store = self.profiles.as_ref()?;
        store
            .load_profile(project_id, profile_id)
            .await
            .ok()
            .map(|p| p.name)
    }

    fn profile_store(&self) -> Result<&Arc<profiles::LlmProfileStore>, ProviderError> {
        self.profiles.as_ref().ok_or_else(|| {
            ProviderError::ConfigError(
                "LLM profiles are not available on this deployment".to_string(),
            )
        })
    }

    async fn resolve(&self, request: &ProviderRequest) -> Result<Resolved, ProviderError> {
        if let Some(route) = &request.llm_profile {
            let resolved = self.profile_store()?.resolve(route).await?;
            return Ok(Resolved::Profile {
                client: resolved.client,
                reported_provider: resolved.reported_provider,
                model: route.model.clone(),
            });
        }
        let (provider, client) = self.resolve_env_provider(request)?;
        let size = request.model_size.unwrap_or(ModelSize::Medium);
        Ok(Resolved::Env {
            client,
            model: model_for_size(&provider, size),
            provider,
        })
    }

    pub async fn generate_content(
        &self,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        let resolved = self.resolve(request).await?;
        resolved
            .client()
            .generate_content(resolved.model(), request)
            .await
            .inspect_err(|e| resolved.log_error(request, e))
    }

    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    pub async fn generate_content_stream(
        &self,
        request: &ProviderRequest,
        chunk_tx: &UnboundedSender<ProviderStreamChunk>,
    ) -> ProviderResult<ProviderResponse> {
        let resolved = self.resolve(request).await?;
        resolved
            .client()
            .generate_content_stream(resolved.model(), request, chunk_tx)
            .await
            .inspect_err(|e| resolved.log_error(request, e))
    }

    /// Resolve the model/provider labels for `request` without firing the
    /// call. Used by callers that record them in side-channel observability
    /// spans before/after `generate_content`. Never fails: an unresolvable
    /// request reports empty strings and the actual `generate_content`
    /// surfaces the error.
    pub async fn resolve_model_provider(&self, request: &ProviderRequest) -> ModelProvider {
        match self.resolve(request).await {
            Ok(Resolved::Profile {
                model,
                reported_provider,
                ..
            }) => ModelProvider {
                model,
                provider: reported_provider.to_string(),
            },
            Ok(Resolved::Env {
                model, provider, ..
            }) => {
                // Same names as `LlmProfileProvider::reported_name`: the cost table's
                // provider prefixes, with the Responses clients folded into their family.
                let reported_provider = match provider.as_str() {
                    "openai_responses" => "openai",
                    "azure_chat_completions" | "azure_responses" => "azure",
                    "azure_anthropic" => "azure_ai",
                    other => other,
                };
                ModelProvider {
                    model,
                    provider: reported_provider.to_string(),
                }
            }
            Err(_) => ModelProvider::default(),
        }
    }

    #[allow(dead_code)]
    pub async fn create_batch(
        &self,
        requests: Vec<ProviderRequestItem>,
        display_name: Option<String>,
    ) -> ProviderResult<ProviderBatchOperation> {
        let resolved = match requests.first() {
            Some(first) => self.resolve(&first.request).await?,
            None => {
                let empty = ProviderRequest {
                    contents: Vec::new(),
                    system_instruction: None,
                    tools: None,
                    generation_config: None,
                    service_tier: None,
                    provider: None,
                    model_size: None,
                    llm_profile: None,
                };
                let (provider, client) = self.resolve_env_provider(&empty)?;
                Resolved::Env {
                    client,
                    model: model_for_size(&provider, ModelSize::Medium),
                    provider,
                }
            }
        };
        resolved
            .client()
            .create_batch(resolved.model(), requests, display_name)
            .await
    }

    #[allow(dead_code)]
    pub async fn get_batch(&self, batch_name: &str) -> ProviderResult<ProviderBatchOperation> {
        // TODO: Implement batch retrieval for all providers
        let default = self
            .default_provider
            .as_deref()
            .ok_or_else(|| ProviderError::ConfigError("LLM_PROVIDER is unset".to_string()))?;
        let client = self.providers.get(default).ok_or_else(|| {
            ProviderError::ConfigError(format!("Provider '{default}' not available"))
        })?;
        client.get_batch(batch_name).await
    }
}
