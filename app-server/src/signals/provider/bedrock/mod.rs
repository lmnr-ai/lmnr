use crate::signals::provider::{
    LanguageModelClient, ProviderError, ProviderResult, ProviderUsageMetadata,
    models::{
        ProviderCandidate, ProviderContent, ProviderFinishReason, ProviderFunctionCall,
        ProviderPart, ProviderRequest, ProviderResponse,
    },
};
use aws_sdk_bedrockruntime::Client as AwsBedrockClient;
use aws_sdk_bedrockruntime::types::{
    CachePointBlock, CachePointType, ContentBlock, ConversationRole, InferenceConfiguration,
    Message, StopReason, SystemContentBlock, Tool, ToolInputSchema, ToolResultBlock,
    ToolResultContentBlock, ToolResultStatus, ToolSpecification, ToolUseBlock,
};
use aws_smithy_types::Document;
use serde_json::Value;

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

        let mut messages = Vec::new();
        for content in &request.contents {
            let role = match content.role.as_deref().unwrap_or("user") {
                "user" => ConversationRole::User,
                "assistant" | "model" => ConversationRole::Assistant,
                _ => ConversationRole::User,
            };

            let mut blocks = Vec::new();
            if let Some(parts) = &content.parts {
                for part in parts {
                    if let Some(text) = &part.text {
                        blocks.push(ContentBlock::Text(text.clone()));
                    } else if let Some(func_call) = &part.function_call {
                        let mut tool_use = ToolUseBlock::builder()
                            .name(func_call.name.clone())
                            .tool_use_id(
                                func_call
                                    .id
                                    .clone()
                                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                            );

                        if let Some(args) = &func_call.args {
                            let doc = value_to_document(args);
                            tool_use = tool_use.input(doc);
                        }

                        blocks.push(ContentBlock::ToolUse(
                            tool_use
                                .build()
                                .map_err(|e| ProviderError::RequestError(e.to_string()))?,
                        ));
                    } else if let Some(func_resp) = &part.function_response {
                        // Use text stringified JSON as it's perfectly supported and simpler to manage than Document conversions
                        let text = serde_json::to_string(&func_resp.response).unwrap_or_default();
                        let content_block = ToolResultContentBlock::Text(text);

                        let tool_result = ToolResultBlock::builder()
                            .tool_use_id(func_resp.id.clone().unwrap_or_default())
                            .status(ToolResultStatus::Success)
                            .content(content_block)
                            .build()
                            .map_err(|e| ProviderError::RequestError(e.to_string()))?;

                        blocks.push(ContentBlock::ToolResult(tool_result));
                    }
                }
            }

            let msg = Message::builder()
                .role(role)
                .set_content(Some(blocks))
                .build()
                .map_err(|e| ProviderError::RequestError(e.to_string()))?;

            messages.push(msg);
        }

        if let Some(first_msg) = messages.first() {
            if first_msg.role() == &ConversationRole::User {
                let mut blocks = first_msg.content().to_vec();
                blocks.push(ContentBlock::CachePoint(build_cache_point()?));

                let updated_msg = Message::builder()
                    .role(ConversationRole::User)
                    .set_content(Some(blocks))
                    .build()
                    .map_err(|e| ProviderError::RequestError(e.to_string()))?;

                messages[0] = updated_msg;
            }
        }

        let mut req_builder = self
            .client
            .converse()
            .model_id(model)
            .set_messages(Some(messages));

        if let Some(sys) = &request.system_instruction {
            let mut sys_blocks = Vec::new();
            if let Some(parts) = &sys.parts {
                for part in parts {
                    if let Some(text) = &part.text {
                        sys_blocks.push(SystemContentBlock::Text(text.clone()));
                    }
                }
            }
            req_builder = req_builder.set_system(Some(sys_blocks));
        }

        if let Some(tools) = &request.tools {
            let mut bedrock_tools = Vec::new();
            for t in tools {
                for func in &t.function_declarations {
                    let schema_doc = value_to_document(&func.parameters);
                    let input_schema = ToolInputSchema::Json(schema_doc);
                    let spec = ToolSpecification::builder()
                        .name(func.name.clone())
                        .description(func.description.clone())
                        .input_schema(input_schema)
                        .build()
                        .map_err(|e| ProviderError::RequestError(e.to_string()))?;
                    bedrock_tools.push(Tool::ToolSpec(spec));
                }
            }

            if !bedrock_tools.is_empty() {
                let tool_config = aws_sdk_bedrockruntime::types::ToolConfiguration::builder()
                    .set_tools(Some(bedrock_tools))
                    .build()
                    .map_err(|e| ProviderError::RequestError(e.to_string()))?;

                req_builder = req_builder.tool_config(tool_config);
            }
        }

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

        if let Some(gen_config) = &request.generation_config {
            let mut inference_config = InferenceConfiguration::builder();
            // temperature, top_p, top_k are incompatible with extended thinking
            if !thinking_enabled {
                if let Some(temp) = gen_config.temperature {
                    inference_config = inference_config.temperature(temp);
                }
                if let Some(top_p) = gen_config.top_p {
                    inference_config = inference_config.top_p(top_p);
                }
            }
            // budget_tokens must be < max_tokens, so when thinking is enabled
            // bump max_tokens to fit both the thinking budget and desired output.
            let max_tokens = gen_config.max_output_tokens.unwrap_or(4096);
            let effective_max_tokens = if thinking_enabled {
                max_tokens + thinking_budget as i32
            } else {
                max_tokens
            };
            inference_config = inference_config.max_tokens(effective_max_tokens);
            req_builder = req_builder.inference_config(inference_config.build());
        }

        if thinking_enabled {
            let thinking_doc = Document::Object(
                [(
                    "thinking".to_string(),
                    Document::Object(
                        [
                            ("type".to_string(), Document::String("enabled".to_string())),
                            (
                                "budget_tokens".to_string(),
                                Document::Number(aws_smithy_types::Number::PosInt(thinking_budget)),
                            ),
                        ]
                        .into(),
                    ),
                )]
                .into(),
            );
            req_builder = req_builder.additional_model_request_fields(thinking_doc);
        }

        let resp = req_builder.send().await.map_err(|e| {
            log::error!("Failed to call AWS Bedrock provider. {e}");
            let status = e.raw_response().map(|r| r.status().as_u16()).unwrap_or(500);
            ProviderError::ApiError {
                status_code: status,
                message: e.to_string(),
                retryable: status >= 500 || status == 429,
                resource_exhausted: status == 429,
            }
        })?;

        let output = resp.output().ok_or(ProviderError::ParseError(
            "No output in response".to_string(),
        ))?;

        let mut provider_parts = Vec::new();

        if let aws_sdk_bedrockruntime::types::ConverseOutput::Message(m) = output {
            for block in m.content() {
                match block {
                    ContentBlock::Text(t) => {
                        provider_parts.push(ProviderPart {
                            text: Some(t.clone()),
                            ..Default::default()
                        });
                    }
                    ContentBlock::ToolUse(tu) => {
                        let args = document_to_value(tu.input());
                        provider_parts.push(ProviderPart {
                            function_call: Some(ProviderFunctionCall {
                                id: Some(tu.tool_use_id().to_string()),
                                name: tu.name().to_string(),
                                args: Some(args),
                            }),
                            ..Default::default()
                        });
                    }
                    _ => {}
                }
            }
        }

        let finish_reason = match resp.stop_reason() {
            StopReason::EndTurn => ProviderFinishReason::Stop,
            StopReason::MaxTokens => ProviderFinishReason::MaxTokens,
            StopReason::ContentFiltered => ProviderFinishReason::Safety,
            StopReason::ToolUse => ProviderFinishReason::Stop,
            stop_reason => ProviderFinishReason::Other(stop_reason.as_str().to_string()),
        };

        let cand = ProviderCandidate {
            content: Some(ProviderContent {
                role: Some("model".to_string()),
                parts: Some(provider_parts),
            }),
            finish_reason: Some(finish_reason),
        };

        let usage = resp.usage().map(|u| ProviderUsageMetadata {
            prompt_token_count: Some(
                u.input_tokens() as i32
                    + u.cache_read_input_tokens().unwrap_or(0)
                    + u.cache_write_input_tokens().unwrap_or(0),
            ),
            candidates_token_count: Some(u.output_tokens() as i32),
            total_token_count: Some(u.total_tokens() as i32),
            cache_read_input_tokens: u.cache_read_input_tokens(),
            cache_creation_input_tokens: u.cache_write_input_tokens(),
        });

        Ok(ProviderResponse {
            candidates: Some(vec![cand]),
            usage_metadata: usage,
            model_version: Some(model.to_string()),
        })
    }
}

fn build_cache_point() -> Result<CachePointBlock, ProviderError> {
    CachePointBlock::builder()
        .r#type(CachePointType::Default)
        .build()
        .map_err(|e| ProviderError::RequestError(e.to_string()))
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

// Map serde_json::Value to aws_smithy_types::Document
fn value_to_document(v: &serde_json::Value) -> aws_smithy_types::Document {
    match v {
        Value::Null => aws_smithy_types::Document::Null,
        Value::Bool(b) => aws_smithy_types::Document::Bool(*b),
        Value::Number(n) => {
            if let Some(f) = n.as_f64() {
                aws_smithy_types::Document::Number(aws_smithy_types::Number::Float(f))
            } else if let Some(i) = n.as_i64() {
                if i >= 0 {
                    aws_smithy_types::Document::Number(aws_smithy_types::Number::PosInt(i as u64))
                } else {
                    aws_smithy_types::Document::Number(aws_smithy_types::Number::NegInt(i))
                }
            } else {
                aws_smithy_types::Document::Null
            }
        }
        Value::String(s) => aws_smithy_types::Document::String(s.clone()),
        Value::Array(arr) => {
            aws_smithy_types::Document::Array(arr.iter().map(value_to_document).collect())
        }
        Value::Object(obj) => aws_smithy_types::Document::Object(
            obj.iter()
                .map(|(k, v)| (k.clone(), value_to_document(v)))
                .collect(),
        ),
    }
}

// Map aws_smithy_types::Document back to serde_json::Value
fn document_to_value(d: &aws_smithy_types::Document) -> serde_json::Value {
    match d {
        Document::Null => serde_json::Value::Null,
        Document::Bool(b) => serde_json::Value::Bool(*b),
        Document::Number(n) => match n {
            aws_smithy_types::Number::PosInt(i) => Value::Number((*i).into()),
            aws_smithy_types::Number::NegInt(i) => Value::Number((*i).into()),
            aws_smithy_types::Number::Float(f) => Value::Number(
                serde_json::Number::from_f64(*f)
                    .unwrap_or(serde_json::Number::from_f64(0.0).unwrap()),
            ),
        },
        Document::String(s) => Value::String(s.clone()),
        Document::Array(arr) => Value::Array(arr.iter().map(document_to_value).collect()),
        Document::Object(obj) => {
            let mut map = serde_json::Map::new();
            for (k, v) in obj {
                map.insert(k.clone(), document_to_value(v));
            }
            Value::Object(map)
        }
    }
}
