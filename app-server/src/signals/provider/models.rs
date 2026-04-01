use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRequestItem {
    pub request: ProviderRequest,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRequest {
    pub contents: Vec<ProviderContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_instruction: Option<ProviderContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ProviderTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_config: Option<ProviderGenerationConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_config: Option<ProviderThinkingConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderThinkingConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_thoughts: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_level: Option<ProviderThinkingLevel>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProviderThinkingLevel {
    #[default]
    ThinkingLevelUnspecified,
    Minimal,
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parts: Option<Vec<ProviderPart>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_call: Option<ProviderFunctionCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_response: Option<ProviderFunctionResponse>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thought: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thought_signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderFunctionCall {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderFunctionResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    pub response: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTool {
    pub function_declarations: Vec<ProviderFunctionDeclaration>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderFunctionDeclaration {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderBatchOutput {
    pub responses: Vec<ProviderInlineResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInlineResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<ProviderResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ProviderErrorInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidates: Option<Vec<ProviderCandidate>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_metadata: Option<ProviderUsageMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCandidate {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<ProviderContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<ProviderFinishReason>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProviderFinishReason {
    Stop,
    MaxTokens,
    Safety,
    MalformedFunctionCall,
    Other(String),
}

impl ProviderFinishReason {
    pub fn is_retryable(&self) -> bool {
        match self {
            Self::Stop => true,
            Self::MaxTokens | Self::Safety => false,
            Self::MalformedFunctionCall => true,
            Self::Other(_) => true,
        }
    }

    pub fn is_success(&self) -> bool {
        matches!(self, Self::Stop)
    }

    pub fn is_malformed_function_call(&self) -> bool {
        matches!(self, Self::MalformedFunctionCall)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderErrorInfo {
    pub code: i32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsageMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_token_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidates_token_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_token_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderBatchOperation {
    pub name: String,
    #[serde(default)]
    pub done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<ProviderBatchOutput>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ProviderErrorInfo>,
}
