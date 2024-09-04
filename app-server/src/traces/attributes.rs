/// Refer to the following links for more information:
/// - https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-spans.md
/// - https://github.com/openlit/openlit/blob/main/sdk/python/src/openlit/semcov/__init__.py
pub const GEN_AI_INPUT_TOKENS: &str = "gen_ai.usage.prompt_tokens";
pub const GEN_AI_OUTPUT_TOKENS: &str = "gen_ai.usage.completion_tokens";
// pub const GEN_AI_TOTAL_TOKENS: &str = "gen_ai.usage.total_tokens";
pub const GEN_AI_REQUEST_MODEL: &str = "gen_ai.request.model";
pub const GEN_AI_RESPONSE_MODEL: &str = "gen_ai.response.model";
// pub const GEN_AI_REQUEST_IS_STREAM: &str = "gen_ai.request.is_stream";
pub const GEN_AI_SYSTEM: &str = "gen_ai.system";
