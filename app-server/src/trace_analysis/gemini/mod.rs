pub mod client;
pub mod utils;

pub use client::GeminiClient;

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// https://ai.google.dev/gemini-api/docs/troubleshooting#error-codes

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GeminiErrorStatus {
    InvalidArgument,
    FailedPrecondition,
    PermissionDenied,
    NotFound,
    ResourceExhausted,
    Internal,
    Unavailable,
    DeadlineExceeded,
    Unknown(String),
}

impl GeminiErrorStatus {
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            GeminiErrorStatus::Internal
                | GeminiErrorStatus::Unavailable
                | GeminiErrorStatus::DeadlineExceeded
                | GeminiErrorStatus::ResourceExhausted
        )
    }

    pub fn from_http(status_code: u16, status_msg: &str) -> Self {
        match (status_code, status_msg) {
            (400, msg) if msg.contains("INVALID_ARGUMENT") => Self::InvalidArgument,
            (400, msg) if msg.contains("FAILED_PRECONDITION") => Self::FailedPrecondition,
            (403, _) => Self::PermissionDenied,
            (404, _) => Self::NotFound,
            (429, _) => Self::ResourceExhausted,
            (500, _) => Self::Internal,
            (503, _) => Self::Unavailable,
            (504, _) => Self::DeadlineExceeded,
            _ => Self::Unknown(status_msg.to_string()),
        }
    }
}

#[derive(Debug, Error)]
pub enum GeminiError {
    #[error("Request failed: {0}")]
    RequestError(#[from] reqwest::Error),

    #[error("Failed to parse response: {0}")]
    ParseError(#[from] serde_json::Error),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Gemini API error ({status_code} {status:?}): {message}")]
    ApiError {
        status_code: u16,
        status: GeminiErrorStatus,
        message: String,
    },
}

impl GeminiError {
    pub fn config<S: Into<String>>(msg: S) -> Self {
        GeminiError::ConfigError(msg.into())
    }

    pub fn from_response(status_code: u16, message: String) -> Self {
        let status = GeminiErrorStatus::from_http(status_code, &message);
        GeminiError::ApiError {
            status_code,
            status,
            message,
        }
    }

    pub fn is_retryable(&self) -> bool {
        match self {
            GeminiError::ApiError { status, .. } => status.is_retryable(),
            GeminiError::RequestError(_) => true,
            _ => false,
        }
    }
}

//https://ai.google.dev/api/batch-api

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Content {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    pub parts: Vec<Part>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_call: Option<FunctionCall>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub args: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequences: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionDeclaration {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tool {
    pub function_declarations: Vec<FunctionDeclaration>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateContentRequest {
    pub contents: Vec<Content>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_config: Option<GenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_instruction: Option<Content>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineRequests {
    pub requests: Vec<InlineRequestItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineRequestItem {
    pub request: GenerateContentRequest,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputConfig {
    pub requests: Option<InlineRequests>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Batch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    pub input_config: InputConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchCreateRequest {
    pub batch: Batch,
}

impl BatchCreateRequest {
    pub fn inline(requests: Vec<GenerateContentRequest>, display_name: Option<String>) -> Self {
        let inline_items: Vec<InlineRequestItem> = requests
            .into_iter()
            .map(|request| InlineRequestItem {
                request,
                metadata: None,
            })
            .collect();

        Self {
            batch: Batch {
                display_name,
                input_config: InputConfig {
                    requests: Some(InlineRequests {
                        requests: inline_items,
                    }),
                    file_name: None,
                },
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum JobState {
    BATCH_STATE_UNSPECIFIED,
    BATCH_STATE_PENDING,
    BATCH_STATE_RUNNING,
    BATCH_STATE_SUCCEEDED,
    BATCH_STATE_FAILED,
    BATCH_STATE_CANCELLED,
    BATCH_STATE_EXPIRED,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchStats {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_count: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_request_count: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub successful_request_count: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed_request_count: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InlinedResponsesWrapper {
    pub inlined_responses: Vec<InlineResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateContentBatchOutput {
    pub inlined_responses: InlinedResponsesWrapper,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorInfo {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchJobMetadata {
    #[serde(rename = "@type")]
    pub type_url: String,
    pub model: String,
    pub display_name: String,
    pub name: String,
    pub state: JobState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_stats: Option<BatchStats>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<GenerateContentBatchOutput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Operation {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<BatchJobMetadata>,
    pub done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<GenerateContentBatchOutput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub content: Content,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safety_ratings: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_token_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidates_token_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_token_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thoughts_token_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_tokens_details: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateContentResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidates: Option<Vec<Candidate>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_metadata: Option<UsageMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<GenerateContentResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}
