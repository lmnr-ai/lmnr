//! Utility functions for parsing Gemini API responses.

use uuid::Uuid;

use super::{Candidate, FunctionCall, InlineResponse};

/// Parsed response from Gemini API containing all extracted fields.
pub struct ParsedInlineResponse {
    /// Run ID from metadata
    pub run_id: Option<Uuid>,
    /// Trace ID from metadata
    pub trace_id: Option<Uuid>,
    /// Whether the response contains an error
    pub has_error: bool,
    /// Serialized content for storage
    pub content: String,
    /// Function call if present
    pub function_call: Option<FunctionCall>,
    /// Text response if present
    pub text: Option<String>,
    /// Input tokens (prompt_token_count in Gemini)
    pub input_tokens: Option<i32>,
    /// Output tokens (candidates_token_count in Gemini)
    pub output_tokens: Option<i32>,
}

/// Parse an InlineResponse into a structured format with all extracted fields.
pub fn parse_inline_response(inline_response: &InlineResponse) -> ParsedInlineResponse {
    let run_id = extract_run_id(inline_response);
    let trace_id = extract_trace_id(inline_response);
    let has_error = inline_response.error.is_some();
    let candidate = get_first_candidate(inline_response);

    let content = candidate
        .and_then(|c| c.content.as_ref())
        .map(|c| serde_json::to_string(c).unwrap_or_default())
        .unwrap_or_default();

    let function_call = candidate
        .and_then(|c| c.content.as_ref())
        .and_then(|c| c.parts.iter().find_map(|p| p.function_call.clone()));

    let text = candidate
        .and_then(|c| c.content.as_ref())
        .and_then(|c| c.parts.iter().find_map(|p| p.text.clone()));

    // Include thoughts tokens in output tokens.
    // Divide by 2 with ceiling to account for discounted batching price.
    // TODO: remove division once batching price is supported on cost calculation side.
    let (input_tokens, output_tokens) = inline_response
        .response
        .as_ref()
        .and_then(|r| r.usage_metadata.as_ref())
        .map(|u| {
            let input = u.prompt_token_count.map(|t| (t + 1) / 2);
            let output = u
                .candidates_token_count
                .unwrap_or(0)
                .saturating_add(u.thoughts_token_count.unwrap_or(0));
            let output = (output + 1) / 2; // ceiling division
            (input, Some(output))
        })
        .unwrap_or((None, None));

    ParsedInlineResponse {
        run_id,
        trace_id,
        has_error,
        content,
        function_call,
        text,
        input_tokens,
        output_tokens,
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
