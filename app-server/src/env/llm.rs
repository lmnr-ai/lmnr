//! LLM provider selection, credentials, and model overrides.
//!
//! Most of these have no single static default (the base URL default depends on
//! the provider; credentials are required), so they're exposed as bare names
//! and the read logic stays in `llm/`. `SIGNALS_ALWAYS_USE_REALTIME` is a
//! boolean toggle with a `false` default.

use super::BoolEnv;

/// `openai` | `gemini` | `bedrock` | `mock`. The single provider switch.
pub const PROVIDER: &str = "LLM_PROVIDER";
/// Shared single-provider API key (openai / gemini).
pub const API_KEY: &str = "LLM_API_KEY";
/// Optional OpenAI-compatible base URL override (provider-specific default).
pub const BASE_URL: &str = "LLM_BASE_URL";
/// Optional JSON map of default headers sent on every LLM request.
pub const DEFAULT_HEADERS_JSON: &str = "LLM_DEFAULT_HEADERS_JSON";

/// Per-size model id overrides (provider-specific hardcoded defaults).
pub const MODEL_SMALL: &str = "LLM_MODEL_SMALL";
pub const MODEL_MEDIUM: &str = "LLM_MODEL_MEDIUM";
pub const MODEL_LARGE: &str = "LLM_MODEL_LARGE";

/// Force the realtime signal path even when the provider supports batch.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const ALWAYS_USE_REALTIME: BoolEnv = BoolEnv::new("SIGNALS_ALWAYS_USE_REALTIME", false);
