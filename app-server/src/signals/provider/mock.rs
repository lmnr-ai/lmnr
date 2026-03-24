//! Mock LLM provider for local testing of batch processing and failure scenarios.
//!
//! Behaviour is controlled at call time via env vars prefixed with `MOCK_LLM_CLIENT`:
//!
//! - `MOCK_LLM_CLIENT_BATCH_FAILURE` — if set, `create_batch` fails with the specified error:
//!   - `"resource_exhausted"` — 429-style ApiError (retryable, triggers retry/realtime fallback)
//!   - `"not_supported"` — NotSupported error (triggers immediate realtime fallback)
//! - `MOCK_LLM_CLIENT_BATCH_PENDING_TRIES` — number of times `get_batch` returns `done: false`
//!   before succeeding. Defaults to 0 (immediately done).
//! - `MOCK_LLM_CLIENT_STEPS_COUNT` — total number of steps to before returning the final result.
//!   All but last step return `get_full_spans`, last step returns `submit_identification`.
//!   Defaults to 2.
//!
//! For programmatic control in tests, use [`MockProviderClient::with_generate_failure`] to
//! configure `generate_content` to fail a specified number of times before succeeding.
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use dashmap::DashMap;
use uuid::Uuid;

use super::models::ProviderRequest;
use crate::signals::provider::{
    LanguageModelClient, ProviderBatchOperation, ProviderBatchOutput, ProviderCandidate,
    ProviderContent, ProviderError, ProviderFinishReason, ProviderFunctionCall,
    ProviderInlineResponse, ProviderPart, ProviderRequestItem, ProviderResponse, ProviderResult,
};

struct BatchEntry {
    requests: Vec<ProviderRequestItem>,
    poll_count: u32,
}

/// Controls how `generate_content` fails during testing.
#[derive(Clone)]
pub enum GenerateFailureMode {
    /// Return a retryable 429 ApiError (resource exhausted).
    #[allow(dead_code)]
    Retryable429,
    /// Return a non-retryable 400 ApiError.
    #[allow(dead_code)]
    NonRetryable,
}

/// Configuration for programmatic `generate_content` failure injection.
#[derive(Clone)]
struct GenerateFailureConfig {
    /// How many calls to `generate_content` should fail before succeeding.
    /// `usize::MAX` means fail forever.
    fail_count: usize,
    mode: GenerateFailureMode,
}

#[derive(Clone)]
pub struct MockProviderClient {
    batches: Arc<DashMap<String, BatchEntry>>,
    /// Tracks how many times `generate_content` has been called.
    generate_call_count: Arc<AtomicUsize>,
    /// Optional failure injection for `generate_content`.
    generate_failure: Option<GenerateFailureConfig>,
}

impl Default for MockProviderClient {
    fn default() -> Self {
        Self {
            batches: Arc::new(DashMap::new()),
            generate_call_count: Arc::new(AtomicUsize::new(0)),
            generate_failure: None,
        }
    }
}

impl MockProviderClient {
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a mock provider that fails `generate_content` for the first `fail_count` calls,
    /// then succeeds. Use `usize::MAX` for `fail_count` to fail forever.
    #[cfg(test)]
    pub fn with_generate_failure(fail_count: usize, mode: GenerateFailureMode) -> Self {
        Self {
            generate_failure: Some(GenerateFailureConfig { fail_count, mode }),
            ..Self::default()
        }
    }

    /// Returns how many times `generate_content` has been called.
    #[cfg(test)]
    pub fn generate_call_count(&self) -> usize {
        self.generate_call_count.load(Ordering::Relaxed)
    }
}

fn mock_submit_identification() -> ProviderFunctionCall {
    ProviderFunctionCall {
        id: None,
        name: "submit_identification".to_string(),
        args: Some(serde_json::json!({
            "identified": true,
            "data": { "foo": "bar" },
            "summary": "This is a test summary"
        })),
    }
}

fn mock_get_full_spans() -> ProviderFunctionCall {
    ProviderFunctionCall {
        id: None,
        name: "get_full_spans".to_string(),
        args: Some(serde_json::json!({
            "span_ids": ["a1b2c3"]
        })),
    }
}

fn mock_steps_count() -> usize {
    std::env::var("MOCK_LLM_CLIENT_STEPS_COUNT")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(2)
}

fn current_step(request: &ProviderRequest) -> usize {
    request
        .contents
        .iter()
        .filter(|c| c.role.as_deref() == Some("model"))
        .count()
        + 1
}

fn mock_response(request: &ProviderRequest) -> ProviderResponse {
    let step = current_step(request);
    let total = mock_steps_count();
    let is_last = step >= total;

    log::debug!(
        "[Mock LLM client] step={}/{}. Returning {}",
        step,
        total,
        if is_last {
            "submit_identification"
        } else {
            "get_full_spans"
        }
    );

    let function_call = if is_last {
        mock_submit_identification()
    } else {
        mock_get_full_spans()
    };

    ProviderResponse {
        candidates: Some(vec![ProviderCandidate {
            content: Some(ProviderContent {
                role: Some("model".to_string()),
                parts: Some(vec![ProviderPart {
                    function_call: Some(function_call),
                    ..Default::default()
                }]),
            }),
            finish_reason: Some(ProviderFinishReason::Stop),
        }]),
        usage_metadata: None,
        model_version: None,
    }
}

impl LanguageModelClient for MockProviderClient {
    fn supports_batch(&self) -> bool {
        true
    }

    async fn generate_content(
        &self,
        _model: &str,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        let call_num = self.generate_call_count.fetch_add(1, Ordering::Relaxed);

        if let Some(ref config) = self.generate_failure {
            if call_num < config.fail_count {
                log::debug!(
                    "[Mock LLM client] Generate single. Returning failure (call {}/{})",
                    call_num + 1,
                    config.fail_count,
                );
                return match config.mode {
                    GenerateFailureMode::Retryable429 => Err(ProviderError::ApiError {
                        status_code: 429,
                        message: "Mock: resource exhausted".to_string(),
                        retryable: true,
                        resource_exhausted: true,
                    }),
                    GenerateFailureMode::NonRetryable => Err(ProviderError::ApiError {
                        status_code: 400,
                        message: "Mock: bad request".to_string(),
                        retryable: false,
                        resource_exhausted: false,
                    }),
                };
            }
        }

        log::debug!("[Mock LLM client] Generate single. Returning mock response");
        Ok(mock_response(request))
    }

    async fn create_batch(
        &self,
        _model: &str,
        requests: Vec<ProviderRequestItem>,
        _display_name: Option<String>,
    ) -> ProviderResult<ProviderBatchOperation> {
        match std::env::var("MOCK_LLM_CLIENT_BATCH_FAILURE")
            .ok()
            .as_deref()
        {
            Some("resource_exhausted") => {
                log::debug!(
                    "[Mock LLM client] create_batch called. Returning 429 resource exhausted"
                );
                return Err(ProviderError::ApiError {
                    status_code: 429,
                    message: "Mock: resource exhausted".to_string(),
                    retryable: true,
                    resource_exhausted: true,
                });
            }
            Some("not_supported") => {
                log::debug!("[Mock LLM client] create_batch called. Returning batch not supported");
                return Err(ProviderError::NotSupported(
                    "Mock: batch not supported".to_string(),
                ));
            }
            _ => {}
        }

        let batch_id = Uuid::new_v4().to_string();
        let request_count = requests.len();
        self.batches.insert(
            batch_id.clone(),
            BatchEntry {
                requests,
                poll_count: 0,
            },
        );
        log::debug!(
            "[Mock LLM client] create_batch called with {} requests. batch_id={}. Returning pending",
            request_count,
            batch_id
        );
        Ok(ProviderBatchOperation {
            name: batch_id,
            done: false,
            response: None,
            error: None,
        })
    }

    async fn get_batch(&self, batch_name: &str) -> ProviderResult<ProviderBatchOperation> {
        let mut entry = self.batches.get_mut(batch_name).ok_or_else(|| {
            ProviderError::NotSupported(format!("Batch '{batch_name}' not found"))
        })?;

        let pending_tries = std::env::var("MOCK_LLM_CLIENT_BATCH_PENDING_TRIES")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(0);

        entry.poll_count += 1;

        if entry.poll_count <= pending_tries {
            log::debug!(
                "[Mock LLM client] get_batch called. batch_name={}. poll_count={}/{}. Returning pending",
                batch_name,
                entry.poll_count,
                pending_tries
            );
            return Ok(ProviderBatchOperation {
                name: batch_name.to_string(),
                done: false,
                response: None,
                error: None,
            });
        }

        let responses = entry
            .requests
            .iter()
            .map(|item| ProviderInlineResponse {
                response: Some(mock_response(&item.request)),
                error: None,
                metadata: item.metadata.clone(),
            })
            .collect::<Vec<_>>();

        log::debug!(
            "[Mock LLM client] get_batch called. batch_name={}. Returning done with {} responses",
            batch_name,
            responses.len()
        );

        Ok(ProviderBatchOperation {
            name: batch_name.to_string(),
            done: true,
            response: Some(ProviderBatchOutput { responses }),
            error: None,
        })
    }
}
