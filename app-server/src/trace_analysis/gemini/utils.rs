//! Utility functions for parsing Gemini API responses.

use uuid::Uuid;

use super::{Candidate, FunctionCall, InlineResponse};

/// Parsed response from Gemini API containing all extracted fields.
pub struct ParsedInlineResponse {
    /// Task ID from metadata
    pub task_id: Option<Uuid>,
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
    let task_id = extract_task_id(inline_response);
    let has_error = inline_response.error.is_some();
    let candidate = get_first_candidate(inline_response);

    let content = candidate
        .map(|c| serde_json::to_string(&c.content).unwrap_or_default())
        .unwrap_or_default();

    let function_call =
        candidate.and_then(|c| c.content.parts.iter().find_map(|p| p.function_call.clone()));

    let text = candidate.and_then(|c| c.content.parts.iter().find_map(|p| p.text.clone()));

    let (input_tokens, output_tokens) = inline_response
        .response
        .as_ref()
        .and_then(|r| r.usage_metadata.as_ref())
        .map(|u| (u.prompt_token_count, u.candidates_token_count))
        .unwrap_or((None, None));

    ParsedInlineResponse {
        task_id,
        has_error,
        content,
        function_call,
        text,
        input_tokens,
        output_tokens,
    }
}

fn extract_task_id(inline_response: &InlineResponse) -> Option<Uuid> {
    let task_id_str = inline_response
        .metadata
        .as_ref()?
        .get("task_id")?
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
