//! Tunables for static system-prompt extraction (`traces/system_extraction`).

/// Provider override for the system extraction agent's LLM calls (e.g. `"bedrock"`,
/// `"gemini"`).
pub const SP_EXTRACTION_LLM_PROVIDER: &str = "SP_EXTRACTION_LLM_PROVIDER";
