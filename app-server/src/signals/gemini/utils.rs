//! Utility functions for parsing Gemini API responses.

use uuid::Uuid;

use crate::signals::gemini::{FinishReason, GeminiModality, Modality};

use super::{Candidate, FunctionCall, InlineResponse};

/// Parsed response from Gemini API containing all extracted fields.
pub struct ParsedInlineResponse {
    /// Run ID from metadata
    pub run_id: Option<Uuid>,
    /// Trace ID from metadata
    pub trace_id: Option<Uuid>,
    /// Whether the response contains an error
    pub has_error: bool,
    /// Original error message from Gemini API if present
    pub error_message: Option<String>,
    /// Serialized content for storage
    pub content: Option<String>,
    /// Function call if present
    pub function_call: Option<FunctionCall>,
    /// Text response if present
    pub text: Option<String>,
    /// Input tokens (prompt_token_count in Gemini)
    pub input_tokens: Option<i32>,

    pub input_cached_tokens: Option<i64>,

    /// Output tokens (candidates_token_count in Gemini)
    pub output_tokens: Option<i32>,
    /// Finish reason if present
    pub finish_reason: Option<FinishReason>,
    /// Finish message if present
    pub finish_message: Option<String>,

    pub model_version: Option<String>,
}

/// Parse an InlineResponse into a structured format with all extracted fields.
pub fn parse_inline_response(inline_response: &InlineResponse) -> ParsedInlineResponse {
    let run_id = extract_run_id(inline_response);
    let trace_id = extract_trace_id(inline_response);
    let has_error = inline_response.error.is_some();
    let error_message = inline_response.error.as_ref().map(|e| e.message.clone());
    let candidate = get_first_candidate(inline_response);

    let content = candidate
        .and_then(|c| c.content.as_ref())
        .map(|c| serde_json::to_string(c).unwrap_or_default());

    let function_call = candidate
        .and_then(|c| c.content.as_ref())
        .and_then(|c| c.parts.as_ref())
        .and_then(|parts| parts.iter().find_map(|p| p.function_call.clone()));

    let text = candidate
        .and_then(|c| c.content.as_ref())
        .and_then(|c| c.parts.as_ref())
        .and_then(|parts| parts.iter().find_map(|p| p.text.clone()));

    let finish_reason = candidate.and_then(|c| c.finish_reason.clone());

    // Include thoughts tokens in output tokens.
    let (input_tokens, input_cached_tokens, output_tokens) = inline_response
        .response
        .as_ref()
        .and_then(|r| r.usage_metadata.as_ref())
        .map(|u| {
            let input = u.prompt_token_count;
            let input_cached_tokens = u.cache_tokens_details.as_ref().map(|details| {
                details
                    .iter()
                    .filter_map(|d| {
                        if d.modality == Modality::Gemini(GeminiModality::Text) {
                            Some(d.token_count)
                        } else {
                            None
                        }
                    })
                    .sum()
            });
            let output = u
                .candidates_token_count
                .unwrap_or(0)
                .saturating_add(u.thoughts_token_count.unwrap_or(0));
            (input, input_cached_tokens, Some(output))
        })
        .unwrap_or((None, None, None));

    let finish_message = candidate.and_then(|c| c.finish_message.clone());
    let model_version = inline_response
        .response
        .as_ref()
        .and_then(|r| r.model_version.clone());

    ParsedInlineResponse {
        run_id,
        trace_id,
        has_error,
        error_message,
        content,
        function_call,
        text,
        input_tokens,
        input_cached_tokens,
        output_tokens,
        finish_reason,
        finish_message,
        model_version,
    }
}

fn extract_run_id(inline_response: &InlineResponse) -> Option<Uuid> {
    let task_id_str = inline_response.metadata.as_ref()?.get("run_id")?.as_str()?;
    Uuid::parse_str(task_id_str).ok()
}

fn extract_trace_id(inline_response: &InlineResponse) -> Option<Uuid> {
    let task_id_str = inline_response
        .metadata
        .as_ref()?
        .get("trace_id")?
        .as_str()?;
    Uuid::parse_str(task_id_str).ok()
}

fn get_first_candidate(inline_response: &InlineResponse) -> Option<&Candidate> {
    inline_response
        .response
        .as_ref()?
        .candidates
        .as_ref()?
        .first()
}
