use super::*;
use crate::signals::provider::models::*;

impl From<GenerateContentResponse> for ProviderResponse {
    fn from(resp: GenerateContentResponse) -> Self {
        ProviderResponse {
            candidates: resp.candidates.map(|cands| {
                cands
                    .into_iter()
                    .map(|c| ProviderCandidate {
                        content: c.content.map(|content| {
                            serde_json::from_value(serde_json::to_value(content).unwrap()).unwrap()
                        }),
                        finish_reason: c.finish_reason.map(|fr| match fr {
                            FinishReason::ModelResponse(fr) => match fr {
                                GeminiFinishReason::Stop
                                | GeminiFinishReason::FinishReasonUnspecified => {
                                    ProviderFinishReason::Stop
                                }
                                GeminiFinishReason::MaxTokens => ProviderFinishReason::MaxTokens,
                                GeminiFinishReason::Safety | GeminiFinishReason::ImageSafety => {
                                    ProviderFinishReason::Safety
                                }
                                GeminiFinishReason::MalformedFunctionCall => {
                                    ProviderFinishReason::MalformedFunctionCall
                                }
                                _ => ProviderFinishReason::Other(format!("{:?}", fr)),
                            },
                            FinishReason::Unknown(s) => ProviderFinishReason::Other(s),
                        }),
                    })
                    .collect()
            }),
            usage_metadata: resp.usage_metadata.map(|u| ProviderUsageMetadata {
                prompt_token_count: u.prompt_token_count,
                candidates_token_count: u.candidates_token_count,
                total_token_count: u.total_token_count,
                cache_tokens_details: u
                    .cache_tokens_details
                    .map(|d| serde_json::to_value(d).unwrap()),
            }),
            model_version: resp.model_version,
        }
    }
}

impl From<ErrorInfo> for ProviderErrorInfo {
    fn from(err: ErrorInfo) -> Self {
        ProviderErrorInfo {
            code: err.code,
            message: err.message,
        }
    }
}

impl From<GenerateContentBatchOutput> for ProviderBatchOutput {
    fn from(output: GenerateContentBatchOutput) -> Self {
        ProviderBatchOutput {
            responses: output
                .inlined_responses
                .inlined_responses
                .into_iter()
                .map(|r| ProviderInlineResponse {
                    response: r.response.map(Into::into),
                    error: r.error.map(Into::into),
                    metadata: r.metadata,
                })
                .collect(),
        }
    }
}

impl From<Operation> for ProviderBatchOperation {
    fn from(op: Operation) -> Self {
        ProviderBatchOperation {
            name: op.name,
            done: op.done,
            response: op.response.map(Into::into),
            error: op.error.map(Into::into),
        }
    }
}
