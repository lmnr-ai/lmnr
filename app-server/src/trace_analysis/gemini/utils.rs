//! Utility functions for parsing Gemini API responses.

use uuid::Uuid;

use super::{Candidate, FunctionCall, InlineResponse};

/// Extract task_id from response metadata
pub fn extract_task_id_from_metadata(inline_response: &InlineResponse) -> Option<Uuid> {
    let task_id_str = inline_response
        .metadata
        .as_ref()?
        .get("task_id")?
        .as_str()?;
    Uuid::parse_str(task_id_str).ok()
}

/// Helper to get the first candidate from a response
fn get_first_candidate(inline_response: &InlineResponse) -> Option<&Candidate> {
    inline_response
        .response
        .as_ref()?
        .candidates
        .as_ref()?
        .first()
}

/// Extract the response content as a string for logging/storage
pub fn extract_response_content(inline_response: &InlineResponse) -> String {
    let Some(candidate) = get_first_candidate(inline_response) else {
        return String::new();
    };

    serde_json::to_string(&candidate.content).unwrap_or_default()
}

/// Extract function call from response if present
pub fn extract_function_call(inline_response: &InlineResponse) -> Option<FunctionCall> {
    let candidate = get_first_candidate(inline_response)?;
    candidate
        .content
        .parts
        .iter()
        .find_map(|p| p.function_call.clone())
}

/// Extract text from response if present
pub fn extract_text(inline_response: &InlineResponse) -> Option<String> {
    let candidate = get_first_candidate(inline_response)?;
    candidate.content.parts.iter().find_map(|p| p.text.clone())
}
