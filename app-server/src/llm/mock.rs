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
//!   All but last step return `grep`, last step returns `submit_identification`.
//!   Defaults to 2.
//! - `MOCK_LLM_CLIENT_GENERATE_FAILURE` — if set, `generate_content` fails with the specified error:
//!   - `"retryable_429"` — retryable 429 ApiError (drives the realtime backoff/retry path)
//!   - `"non_retryable"` — non-retryable 400 ApiError (drives the permanent-failure path)
//! - `MOCK_LLM_CLIENT_GENERATE_FAILURE_COUNT` — how many `generate_content` calls fail before
//!   succeeding. Counter is per-process (across all runs). Defaults to 3. Use `usize::MAX` to
//!   fail forever. Ignored unless `MOCK_LLM_CLIENT_GENERATE_FAILURE` is set.
//!
//! For programmatic control in tests, use [`MockProviderClient::with_generate_failure`] to
//! configure `generate_content` to fail a specified number of times before succeeding, or
//! [`MockProviderClient::with_responder`] to script the response per request.
#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use dashmap::DashMap;
use uuid::Uuid;

use super::models::ProviderRequest;
use crate::llm::{
    LanguageModelClient, ProviderBatchOperation, ProviderBatchOutput, ProviderBatchState,
    ProviderCandidate, ProviderContent, ProviderError, ProviderFinishReason, ProviderFunctionCall,
    ProviderInlineResponse, ProviderPart, ProviderRequestItem, ProviderResponse, ProviderResult,
};

/// Per-request response script: `Some` overrides the built-in step
/// behaviour for that request, `None` falls through to it.
pub type MockResponder =
    Arc<dyn Fn(&ProviderRequest) -> Option<ProviderResponse> + Send + Sync + 'static>;

#[allow(dead_code)]
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
    /// Return a `RequestError` (network/timeout). Retryable on the standard tier
    /// but NOT a flex 429/503, so it drives the immediate flex->standard fallback.
    #[allow(dead_code)]
    Timeout,
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
    #[allow(dead_code)]
    batches: Arc<DashMap<String, BatchEntry>>,
    /// Tracks how many times `generate_content` has been called.
    generate_call_count: Arc<AtomicUsize>,
    /// Optional failure injection for `generate_content`.
    generate_failure: Option<GenerateFailureConfig>,
    /// Tool call returned on every non-final step instead of the default
    /// `grep` — lets tests drive other tools (e.g. the legacy
    /// `search_in_spans`/`get_full_spans` pair).
    intermediate_tool_call: Option<ProviderFunctionCall>,
    /// Scripted responses, consulted before the step-based default. Lets a
    /// test answer the prep-stage calls (summaries, keep rules) whose tool
    /// shapes the built-in `grep` / `submit_identification` flow can't.
    responder: Option<MockResponder>,
}

impl Default for MockProviderClient {
    fn default() -> Self {
        Self {
            batches: Arc::new(DashMap::new()),
            generate_call_count: Arc::new(AtomicUsize::new(0)),
            generate_failure: None,
            intermediate_tool_call: None,
            responder: None,
        }
    }
}

impl MockProviderClient {
    pub fn new() -> Self {
        Self {
            generate_failure: read_generate_failure_from_env(),
            ..Self::default()
        }
    }

    /// Create a mock provider that fails `generate_content` for the first `fail_count` calls,
    /// then succeeds. Use `usize::MAX` for `fail_count` to fail forever.
    #[allow(dead_code)]
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

    /// Create a mock provider whose non-final steps return `function_call`
    /// instead of the default `grep`.
    #[allow(dead_code)]
    pub fn with_intermediate_tool_call(function_call: ProviderFunctionCall) -> Self {
        Self {
            intermediate_tool_call: Some(function_call),
            ..Self::default()
        }
    }

    /// Create a mock provider that answers `generate_content` from
    /// `responder`, falling back to the step-based default when it returns
    /// `None`. Failure injection (if any) still runs first.
    #[allow(dead_code)]
    pub fn with_responder(
        responder: impl Fn(&ProviderRequest) -> Option<ProviderResponse> + Send + Sync + 'static,
    ) -> Self {
        Self {
            responder: Some(Arc::new(responder)),
            ..Self::default()
        }
    }
}

/// A single-candidate `Stop` response carrying `function_calls`, one part
/// each — the shape every tool-driven prep stage parses.
#[allow(dead_code)]
pub fn function_call_response(function_calls: Vec<ProviderFunctionCall>) -> ProviderResponse {
    ProviderResponse {
        candidates: Some(vec![ProviderCandidate {
            content: Some(ProviderContent {
                role: Some("model".to_string()),
                parts: Some(
                    function_calls
                        .into_iter()
                        .map(|fc| ProviderPart {
                            function_call: Some(fc),
                            ..Default::default()
                        })
                        .collect(),
                ),
            }),
            finish_reason: Some(ProviderFinishReason::Stop),
        }]),
        usage_metadata: None,
        model_version: None,
    }
}

/// Reads `MOCK_LLM_CLIENT_GENERATE_FAILURE` (`"retryable_429"` | `"non_retryable"`) and the
/// optional `MOCK_LLM_CLIENT_GENERATE_FAILURE_COUNT` (defaults to `3`).
/// Returns `None` when the failure env var is unset or holds an unrecognized value.
fn read_generate_failure_from_env() -> Option<GenerateFailureConfig> {
    let mode = match std::env::var(crate::env::mock::GENERATE_FAILURE)
        .ok()
        .as_deref()
    {
        Some("retryable_429") => GenerateFailureMode::Retryable429,
        Some("non_retryable") => GenerateFailureMode::NonRetryable,
        Some(other) => {
            log::warn!(
                "[Mock LLM client] Ignoring unrecognized MOCK_LLM_CLIENT_GENERATE_FAILURE={:?} \
                 (expected \"retryable_429\" or \"non_retryable\")",
                other
            );
            return None;
        }
        None => return None,
    };

    let fail_count = crate::env::mock::GENERATE_FAILURE_COUNT.get();

    log::info!(
        "[Mock LLM client] generate_content failure injection enabled: mode={}, fail_count={}",
        match mode {
            GenerateFailureMode::Retryable429 => "retryable_429",
            GenerateFailureMode::NonRetryable => "non_retryable",
            GenerateFailureMode::Timeout => "timeout",
        },
        if fail_count == usize::MAX {
            "forever".to_string()
        } else {
            fail_count.to_string()
        }
    );

    Some(GenerateFailureConfig { fail_count, mode })
}

fn mock_submit_identification() -> ProviderFunctionCall {
    ProviderFunctionCall {
        id: None,
        name: "submit_identification".to_string(),
        // Flat shape: developer fields ride at the top level, `schema_`-prefixed,
        // next to the evaluator's `identified` / `summaries` / `severity`.
        args: Some(serde_json::json!({
            "identified": true,
            "schema_foo": "bar",
            "summaries": ["This is a test summary"],
            "severity": "info"
        })),
    }
}

fn mock_grep() -> ProviderFunctionCall {
    ProviderFunctionCall {
        id: None,
        name: "grep".to_string(),
        args: Some(serde_json::json!({
            "searches": [{
                "reasoning": "mock intermediate step",
                "pattern": "error|exception"
            }]
        })),
    }
}

fn mock_steps_count() -> usize {
    crate::env::mock::STEPS_COUNT.get()
}

fn current_step(request: &ProviderRequest) -> usize {
    request
        .contents
        .iter()
        .filter(|c| c.role.as_deref() == Some("model"))
        .count()
        + 1
}

fn mock_response(
    request: &ProviderRequest,
    intermediate: Option<&ProviderFunctionCall>,
) -> ProviderResponse {
    let step = current_step(request);
    let total = mock_steps_count();
    let is_last = step >= total;

    let function_call = if is_last {
        mock_submit_identification()
    } else {
        intermediate.cloned().unwrap_or_else(mock_grep)
    };

    log::debug!(
        "[Mock LLM client] step={}/{}. Returning {}",
        step,
        total,
        function_call.name
    );

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
                    GenerateFailureMode::Timeout => Err(ProviderError::RequestError(
                        "Mock: request timed out".to_string(),
                    )),
                };
            }
        }

        if let Some(response) = self.responder.as_ref().and_then(|r| r(request)) {
            log::debug!("[Mock LLM client] Generate single. Returning scripted response");
            return Ok(response);
        }

        log::debug!("[Mock LLM client] Generate single. Returning mock response");
        Ok(mock_response(request, self.intermediate_tool_call.as_ref()))
    }

    async fn create_batch(
        &self,
        _model: &str,
        requests: Vec<ProviderRequestItem>,
        _display_name: Option<String>,
    ) -> ProviderResult<ProviderBatchOperation> {
        match std::env::var(crate::env::mock::BATCH_FAILURE)
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
            state: Some(ProviderBatchState::Pending),
        })
    }

    async fn get_batch(&self, batch_name: &str) -> ProviderResult<ProviderBatchOperation> {
        let mut entry = self.batches.get_mut(batch_name).ok_or_else(|| {
            ProviderError::NotSupported(format!("Batch '{batch_name}' not found"))
        })?;

        let pending_tries = crate::env::mock::BATCH_PENDING_TRIES.get();

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
                state: Some(ProviderBatchState::Running),
            });
        }

        let responses = entry
            .requests
            .iter()
            .map(|item| ProviderInlineResponse {
                response: Some(mock_response(
                    &item.request,
                    self.intermediate_tool_call.as_ref(),
                )),
                error: None,
                metadata: item.metadata.clone(),
            })
            .collect::<Vec<_>>();

        let is_expired = std::env::var(crate::env::mock::BATCH_EXPIRED)
            .is_ok_and(|v| v.trim().to_lowercase() == "true");

        if is_expired {
            log::debug!(
                "[Mock LLM client] get_batch called. batch_name={}. Returning expired",
                batch_name
            );
            return Ok(ProviderBatchOperation {
                name: batch_name.to_string(),
                done: true,
                response: None,
                error: None,
                state: Some(ProviderBatchState::Expired),
            });
        }

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
            state: Some(ProviderBatchState::Succeeded),
        })
    }
}
