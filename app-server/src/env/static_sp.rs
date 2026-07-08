//! Tunables for static system-prompt extraction (`traces/system_extraction`).

use super::NumEnv;

/// Provider override for the system extraction agent's LLM calls (e.g. `"bedrock"`,
/// `"gemini"`).
pub const SP_EXTRACTION_LLM_PROVIDER: &str = "SP_EXTRACTION_LLM_PROVIDER";

/// Number of same-signature system prompts to accumulate before triggering the
/// extraction agent. More samples let the agent tell static text from dynamic
/// fragments reliably.
pub const PROMPT_SAMPLES: NumEnv<usize> = NumEnv::new("SP_EXTRACTION_PROMPT_SAMPLES", 5);

/// TTL (seconds) on the accumulated raw prompts, so signatures that never reach
/// `PROMPT_SAMPLES` don't hold onto prompt bodies forever.
pub const ACCUMULATOR_TTL_SECONDS: NumEnv<u64> =
    NumEnv::new("SP_EXTRACTION_ACCUMULATOR_TTL_SECONDS", 3600);
