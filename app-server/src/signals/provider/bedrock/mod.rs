use crate::signals::provider::{
    LanguageModelClient, ProviderError, ProviderResult, ProviderUsageMetadata,
    models::{
        ProviderCandidate, ProviderContent, ProviderFinishReason, ProviderFunctionCall,
        ProviderPart, ProviderRequest, ProviderResponse,
    },
};
use aws_sdk_bedrockruntime::Client as AwsBedrockClient;
use aws_sdk_bedrockruntime::primitives::Blob;
use serde_json::Value;

fn cache_control_ephemeral() -> Value {
    serde_json::json!({"type": "ephemeral"})
}

#[derive(Clone)]
pub struct BedrockClient {
    client: AwsBedrockClient,
}

impl BedrockClient {
    pub async fn new() -> ProviderResult<Self> {
        let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
        Ok(Self {
            client: AwsBedrockClient::new(&config),
        })
    }
}

fn build_message_blocks(parts: &[ProviderPart]) -> Vec<Value> {
    let mut blocks = Vec::new();
    for part in parts {
        if part.thought == Some(true) {
            let mut block = serde_json::json!({"type": "thinking"});
            if let Some(text) = &part.text {
                block["thinking"] = Value::String(text.clone());
            }
            if let Some(sig) = &part.thought_signature {
                block["signature"] = Value::String(sig.clone());
            }
            blocks.push(block);
        } else if let Some(text) = &part.text {
            blocks.push(serde_json::json!({"type": "text", "text": text}));
        } else if let Some(fc) = &part.function_call {
            let id = fc
                .id
                .clone()
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            blocks.push(serde_json::json!({
                "type": "tool_use",
                "id": id,
                "name": fc.name,
                "input": fc.args.clone().unwrap_or(Value::Object(Default::default())),
            }));
        } else if let Some(fr) = &part.function_response {
            let id = fr.id.clone().unwrap_or_default();
            blocks.push(serde_json::json!({
                "type": "tool_result",
                "tool_use_id": id,
                "content": serde_json::to_string(&fr.response).unwrap_or_default(),
            }));
        }
    }
    blocks
}

impl LanguageModelClient for BedrockClient {
    async fn generate_content(
        &self,
        model: &str,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        let thinking_enabled = request
            .generation_config
            .as_ref()
            .and_then(|gc| gc.thinking_config.as_ref())
            .and_then(|tc| tc.thinking_level.as_ref())
            .is_some_and(|level| {
                !matches!(
                    level,
                    super::models::ProviderThinkingLevel::ThinkingLevelUnspecified
                )
            });

        let thinking_budget = if thinking_enabled {
            request
                .generation_config
                .as_ref()
                .and_then(|gc| gc.thinking_config.as_ref())
                .and_then(|tc| tc.thinking_level.as_ref())
                .map(thinking_level_to_budget)
                .unwrap_or(4096)
        } else {
            0
        };

        let max_tokens = request
            .generation_config
            .as_ref()
            .and_then(|gc| gc.max_output_tokens)
            .unwrap_or(4096);
        let effective_max_tokens = if thinking_enabled {
            max_tokens + thinking_budget as i32
        } else {
            max_tokens
        };

        // Build system blocks with cache_control on the last block
        let mut system_blocks: Vec<Value> = request
            .system_instruction
            .as_ref()
            .and_then(|sys| sys.parts.as_ref())
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|p| p.text.as_ref())
                    .map(|text| serde_json::json!({"type": "text", "text": text}))
                    .collect()
            })
            .unwrap_or_default();
        if let Some(last) = system_blocks.last_mut() {
            last["cache_control"] = cache_control_ephemeral();
        }

        // Build tool definitions
        let tools: Vec<Value> = request
            .tools
            .as_ref()
            .map(|tool_groups| {
                tool_groups
                    .iter()
                    .flat_map(|t| &t.function_declarations)
                    .map(|func| {
                        serde_json::json!({
                            "name": func.name,
                            "description": func.description,
                            "input_schema": func.parameters,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        // Build messages, placing cache_control on the last block of the first user message
        let mut messages: Vec<Value> = Vec::new();
        for (i, content) in request.contents.iter().enumerate() {
            let role = match content.role.as_deref().unwrap_or("user") {
                "assistant" | "model" => "assistant",
                _ => "user",
            };

            let mut blocks = content
                .parts
                .as_ref()
                .map(|p| build_message_blocks(p))
                .unwrap_or_default();

            if i == 0 && role == "user" {
                if let Some(last) = blocks.last_mut() {
                    last.as_object_mut().map(|obj| {
                        obj.insert("cache_control".to_string(), cache_control_ephemeral());
                    });
                }
            }

            messages.push(serde_json::json!({"role": role, "content": blocks}));
        }

        // Assemble request body
        let mut body = serde_json::json!({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": effective_max_tokens,
            "messages": messages,
        });

        if !system_blocks.is_empty() {
            body["system"] = Value::Array(system_blocks);
        }

        if !tools.is_empty() {
            body["tools"] = Value::Array(tools);
        }

        if !thinking_enabled {
            if let Some(temp) = request
                .generation_config
                .as_ref()
                .and_then(|gc| gc.temperature)
            {
                body["temperature"] = serde_json::json!(temp);
            }
            if let Some(top_p) = request.generation_config.as_ref().and_then(|gc| gc.top_p) {
                body["top_p"] = serde_json::json!(top_p);
            }
        }

        if thinking_enabled {
            body["thinking"] = serde_json::json!({
                "type": "enabled",
                "budget_tokens": thinking_budget,
            });
        }

        let body_bytes = serde_json::to_vec(&body)
            .map_err(|e| ProviderError::RequestError(format!("Failed to serialize body: {e}")))?;

        let resp = self
            .client
            .invoke_model()
            .model_id(model)
            .content_type("application/json")
            .body(Blob::new(body_bytes))
            .send()
            .await
            .map_err(|e| {
                log::error!("Failed to call AWS Bedrock InvokeModel. {e}");
                let status = e.raw_response().map(|r| r.status().as_u16()).unwrap_or(500);
                ProviderError::ApiError {
                    status_code: status,
                    message: e.to_string(),
                    retryable: status >= 500 || status == 429,
                    resource_exhausted: status == 429,
                }
            })?;

        let resp_body: Value = serde_json::from_slice(resp.body().as_ref()).map_err(|e| {
            ProviderError::ParseError(format!("Failed to parse response body: {e}"))
        })?;

        // Parse response content blocks (text, tool_use, thinking)
        let mut provider_parts = Vec::new();
        if let Some(content) = resp_body.get("content").and_then(|c| c.as_array()) {
            for block in content {
                let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match block_type {
                    "thinking" => {
                        let thinking_text = block
                            .get("thinking")
                            .and_then(|t| t.as_str())
                            .map(|s| s.to_string());
                        let signature = block
                            .get("signature")
                            .and_then(|s| s.as_str())
                            .map(|s| s.to_string());
                        provider_parts.push(ProviderPart {
                            text: thinking_text,
                            thought: Some(true),
                            thought_signature: signature,
                            ..Default::default()
                        });
                    }
                    "text" => {
                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                            provider_parts.push(ProviderPart {
                                text: Some(text.to_string()),
                                ..Default::default()
                            });
                        }
                    }
                    "tool_use" => {
                        let id = block
                            .get("id")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        let name = block
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let input = block.get("input").cloned();
                        provider_parts.push(ProviderPart {
                            function_call: Some(ProviderFunctionCall {
                                id,
                                name,
                                args: input,
                            }),
                            ..Default::default()
                        });
                    }
                    _ => {}
                }
            }
        }

        let stop_reason = resp_body
            .get("stop_reason")
            .and_then(|s| s.as_str())
            .unwrap_or("");
        let finish_reason = match stop_reason {
            "end_turn" => ProviderFinishReason::Stop,
            "max_tokens" => ProviderFinishReason::MaxTokens,
            "tool_use" => ProviderFinishReason::Stop,
            other => ProviderFinishReason::Other(other.to_string()),
        };

        let cand = ProviderCandidate {
            content: Some(ProviderContent {
                role: Some("model".to_string()),
                parts: Some(provider_parts),
            }),
            finish_reason: Some(finish_reason),
        };

        let usage_obj = resp_body.get("usage");
        let input_tokens = usage_obj
            .and_then(|u| u.get("input_tokens"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;
        let output_tokens = usage_obj
            .and_then(|u| u.get("output_tokens"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;
        let cache_read = usage_obj
            .and_then(|u| u.get("cache_read_input_tokens"))
            .and_then(|v| v.as_i64())
            .map(|v| v as i32);
        let cache_write = usage_obj
            .and_then(|u| u.get("cache_creation_input_tokens"))
            .and_then(|v| v.as_i64())
            .map(|v| v as i32);

        let usage = Some(ProviderUsageMetadata {
            prompt_token_count: Some(
                input_tokens + cache_read.unwrap_or(0) + cache_write.unwrap_or(0),
            ),
            candidates_token_count: Some(output_tokens),
            total_token_count: Some(
                input_tokens + output_tokens + cache_read.unwrap_or(0) + cache_write.unwrap_or(0),
            ),
            cache_read_input_tokens: cache_read,
            cache_creation_input_tokens: cache_write,
        });

        Ok(ProviderResponse {
            candidates: Some(vec![cand]),
            usage_metadata: usage,
            model_version: Some(model.to_string()),
        })
    }
}

fn thinking_level_to_budget(level: &super::models::ProviderThinkingLevel) -> u64 {
    use super::models::ProviderThinkingLevel;
    match level {
        ProviderThinkingLevel::ThinkingLevelUnspecified => 0,
        ProviderThinkingLevel::Minimal => 1_024,
        ProviderThinkingLevel::Low => 2_048,
        ProviderThinkingLevel::Medium => 4_096,
        ProviderThinkingLevel::High => 16_384,
    }
}
