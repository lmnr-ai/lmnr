/// Refer to the following links for more information:
/// - https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-spans.md
/// - https://github.com/traceloop/openllmetry/blob/main/packages/opentelemetry-semantic-conventions-ai/opentelemetry/semconv_ai/__init__.py

// TODO: `prompt_tokens` and `completion_tokens` are not in the OpenTelemetry specs. This must be
// `input_tokens` and `output_tokens` respectively. These are sent by TraceLoop's auto-instrumentation
// library. We should update the library to send the correct attributes.
pub const GEN_AI_INPUT_TOKENS: &str = "gen_ai.usage.input_tokens";
pub const GEN_AI_OUTPUT_TOKENS: &str = "gen_ai.usage.output_tokens";
pub const GEN_AI_PROMPT_TOKENS: &str = "gen_ai.usage.prompt_tokens";
pub const GEN_AI_COMPLETION_TOKENS: &str = "gen_ai.usage.completion_tokens";

pub const GEN_AI_REQUEST_MODEL: &str = "gen_ai.request.model";
pub const GEN_AI_RESPONSE_MODEL: &str = "gen_ai.response.model";
// pub const GEN_AI_REQUEST_IS_STREAM: &str = "gen_ai.request.is_stream";
pub const GEN_AI_SYSTEM: &str = "gen_ai.system";

// This one is not in the open-telemetry specs. See:
// https://github.com/openlit/openlit/blob/main/sdk/python/src/openlit/semcov/__init__.py#L65
pub const GEN_AI_TOTAL_COST: &str = "gen_ai.usage.cost";

// These are in neither standard.
pub const GEN_AI_INPUT_COST: &str = "gen_ai.usage.input_cost";
pub const GEN_AI_OUTPUT_COST: &str = "gen_ai.usage.output_cost";

// Custom lmnr attributes
pub const ASSOCIATION_PROPERTIES_PREFIX: &str = "lmnr.association.properties";
pub const SPAN_TYPE: &str = "lmnr.span.type";
pub const SPAN_PATH: &str = "lmnr.span.path";
pub const SPAN_IDS_PATH: &str = "lmnr.span.ids_path";

pub const GEN_AI_CACHE_WRITE_INPUT_TOKENS: &str = "gen_ai.usage.cache_creation_input_tokens";
pub const GEN_AI_CACHE_READ_INPUT_TOKENS: &str = "gen_ai.usage.cache_read_input_tokens";

// Resource attributes
pub const CLOUD_REGION: &str = "cloud.region";

// Additional usage attributes for cost calculation
pub const GEN_AI_USAGE_AUDIO_INPUT_TOKENS: &str = "gen_ai.usage.audio_input_tokens";
pub const GEN_AI_USAGE_AUDIO_OUTPUT_TOKENS: &str = "gen_ai.usage.audio_output_tokens";
pub const GEN_AI_USAGE_REASONING_TOKENS: &str = "gen_ai.usage.reasoning_tokens";
pub const GEN_AI_USAGE_CACHE_CREATION_EPHEMERAL_5M_TOKENS: &str =
    "gen_ai.usage.cache_creation_ephemeral_5m_input_tokens";
pub const GEN_AI_USAGE_CACHE_CREATION_EPHEMERAL_1H_TOKENS: &str =
    "gen_ai.usage.cache_creation_ephemeral_1h_input_tokens";

// Service tier and batch attributes
pub const OPENAI_RESPONSE_SERVICE_TIER: &str = "openai.response.service_tier";
pub const OPENAI_REQUEST_SERVICE_TIER: &str = "openai.request.service_tier";
pub const GEN_AI_REQUEST_BATCH: &str = "gen_ai.request.batch";
