#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use super::accumulator::GeminiStreamAccumulator;
use super::{
    BatchCreateRequest, FLEX_SERVICE_TIER, GeminiError, GenerateContentRequest,
    GenerateContentResponse, InlineRequestItem, Operation,
};
use crate::env;
use crate::llm::{
    LanguageModelClient, ProviderError, ProviderResult, default_headers_from_env,
    models::{
        ProviderBatchOperation, ProviderRequest, ProviderRequestItem, ProviderResponse,
        ProviderStreamChunk,
    },
    sse::accumulate_sse,
};
use std::sync::LazyLock;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

/// Per-request HTTP timeout applied only to flex-tier requests (the shared client
/// timeout is 120s and must stay that way for every other call). Flex responses can
/// take minutes. Reads `SIGNALS_FLEX_LLM_TIMEOUT_SECS` (default 900).
static FLEX_REQUEST_TIMEOUT: LazyLock<Duration> =
    LazyLock::new(|| Duration::from_secs(env::llm::FLEX_LLM_TIMEOUT_SECS.get()));

/// Log a non-2xx Gemini response. For FLEX requests, transient capacity errors
/// (429/503) are downgraded to `debug` — the flex tier retries them and falls
/// back to standard, so logging every attempt at `error` floods pod logs. On any
/// other path (standard signals, trace-chat, batch) every non-2xx stays at
/// `error`, since a 429/503 there is meaningful and not part of a retry storm.
fn log_gemini_api_error(status: reqwest::StatusCode, error_text: &str, is_flex: bool) {
    if is_flex && matches!(status.as_u16(), 429 | 503) {
        log::debug!(
            "Gemini API capacity error ({}) [flex]: {}",
            status,
            error_text
        );
    } else {
        log::error!("Gemini API error ({}): {}", status, error_text);
    }
}

#[derive(Clone)]
pub struct GeminiClient {
    client: reqwest::Client,
    api_key: String,
    api_base_url: String,
}

pub type GeminiResult<T> = Result<T, GeminiError>;

impl GeminiClient {
    pub fn new() -> GeminiResult<Self> {
        let api_key = std::env::var(env::llm::API_KEY)
            .map_err(|_| GeminiError::config("LLM_API_KEY environment variable not set"))?;

        let raw_base_url = std::env::var(env::llm::BASE_URL)
            .ok()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "https://generativelanguage.googleapis.com/v1beta".to_string());
        let api_base_url = raw_base_url.trim_end_matches('/').to_string();
        let default_headers = default_headers_from_env().map_err(GeminiError::config)?;

        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(120))
            .default_headers(default_headers)
            .build()
            .map_err(|e| GeminiError::config(format!("Failed to build HTTP client: {}", e)))?;

        Ok(Self {
            client,
            api_key,
            api_base_url,
        })
    }

    pub fn api_base_url(&self) -> &str {
        &self.api_base_url
    }

    pub async fn generate_content(
        &self,
        model: &str,
        request: &GenerateContentRequest,
    ) -> GeminiResult<GenerateContentResponse> {
        let url = format!("{}/models/{}:generateContent", self.api_base_url, model);

        let mut req_builder = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .header("Content-Type", "application/json")
            .json(request);

        // Flex requests can run for minutes; override the 120s client default per-request.
        let is_flex = request.service_tier.as_deref() == Some(FLEX_SERVICE_TIER);
        if is_flex {
            req_builder = req_builder.timeout(*FLEX_REQUEST_TIMEOUT);
        }

        let response = req_builder.send().await?;

        let status = response.status();

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log_gemini_api_error(status, &error_text, is_flex);

            return Err(GeminiError::from_response(status.as_u16(), error_text));
        }

        let response_text = response.text().await?;

        let generate_response: GenerateContentResponse = serde_json::from_str(&response_text)?;

        Ok(generate_response)
    }

    pub async fn create_batch(
        &self,
        model: &str,
        requests: Vec<InlineRequestItem>,
        display_name: Option<String>,
    ) -> GeminiResult<Operation> {
        let url = format!(
            "{}/models/{}:batchGenerateContent",
            self.api_base_url, model
        );

        let batch_request = BatchCreateRequest::inline(requests, display_name);

        let response = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .header("Content-Type", "application/json")
            .json(&batch_request)
            .send()
            .await?;

        let status = response.status();

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log_gemini_api_error(status, &error_text, false);

            return Err(GeminiError::from_response(status.as_u16(), error_text));
        }

        let response_text = response.text().await?;

        let operation: Operation = serde_json::from_str(&response_text)?;

        Ok(operation)
    }

    pub async fn get_batch(&self, batch_name: &str) -> GeminiResult<Operation> {
        let url = format!("{}/batches/{}", self.api_base_url, batch_name);

        let response = self
            .client
            .get(&url)
            .header("x-goog-api-key", &self.api_key)
            .send()
            .await?;

        let status = response.status();

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log_gemini_api_error(status, &error_text, false);

            return Err(GeminiError::from_response(status.as_u16(), error_text));
        }

        let response_text = response.text().await?;

        let operation: Operation = serde_json::from_str(&response_text)?;

        Ok(operation)
    }
}

impl LanguageModelClient for GeminiClient {
    fn supports_batch(&self) -> bool {
        true
    }

    async fn generate_content(
        &self,
        model: &str,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        // Provider types share the same JSON schema as Gemini types (camelCase),
        // so serde round-trip conversion is safe here.
        let gemini_req: GenerateContentRequest =
            serde_json::from_value(serde_json::to_value(request).map_err(|e| {
                super::super::ProviderError::RequestError(format!(
                    "Failed to serialize request: {}",
                    e
                ))
            })?)
            .map_err(|e| {
                super::super::ProviderError::RequestError(format!(
                    "Failed to convert request to Gemini format: {}",
                    e
                ))
            })?;
        let res = self.generate_content(model, &gemini_req).await?;
        Ok(res.into())
    }

    async fn generate_content_stream(
        &self,
        model: &str,
        request: &ProviderRequest,
        chunk_tx: &UnboundedSender<ProviderStreamChunk>,
    ) -> ProviderResult<ProviderResponse> {
        let gemini_req: GenerateContentRequest =
            serde_json::from_value(serde_json::to_value(request).map_err(|e| {
                ProviderError::RequestError(format!("Failed to serialize request: {e}"))
            })?)
            .map_err(|e| {
                ProviderError::RequestError(format!(
                    "Failed to convert request to Gemini format: {e}"
                ))
            })?;

        let url = format!(
            "{}/models/{}:streamGenerateContent?alt=sse",
            self.api_base_url, model
        );
        let response = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .header("Content-Type", "application/json")
            .json(&gemini_req)
            .send()
            .await
            .map_err(GeminiError::from)?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log_gemini_api_error(status, &error_text, false);
            return Err(GeminiError::from_response(status.as_u16(), error_text).into());
        }

        accumulate_sse::<GeminiStreamAccumulator, GeminiError>(
            response.bytes_stream(),
            model,
            chunk_tx,
        )
        .await
        .map_err(Into::into)
    }

    async fn create_batch(
        &self,
        model: &str,
        requests: Vec<ProviderRequestItem>,
        display_name: Option<String>,
    ) -> ProviderResult<ProviderBatchOperation> {
        let gemini_reqs: Vec<InlineRequestItem> = requests
            .into_iter()
            .map(|r| {
                let val = serde_json::to_value(r).map_err(|e| {
                    super::super::ProviderError::RequestError(format!(
                        "Failed to serialize batch request: {}",
                        e
                    ))
                })?;
                serde_json::from_value(val).map_err(|e| {
                    super::super::ProviderError::RequestError(format!(
                        "Failed to convert batch request to Gemini format: {}",
                        e
                    ))
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        let res = GeminiClient::create_batch(self, model, gemini_reqs, display_name).await?;
        Ok(res.into())
    }

    async fn get_batch(&self, batch_name: &str) -> ProviderResult<ProviderBatchOperation> {
        let res = GeminiClient::get_batch(self, batch_name).await?;
        Ok(res.into())
    }
}
