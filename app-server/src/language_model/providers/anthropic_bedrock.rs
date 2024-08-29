use std::collections::HashMap;

use crate::language_model::chat_message::{ChatCompletion, ChatMessage};
use crate::language_model::runner::ExecuteChatCompletion;
use crate::language_model::{
    ChatChoice, ChatMessageContent, ChatUsage, LanguageModelProviderName, NodeInfo,
};
use crate::pipeline::nodes::{NodeStreamChunk, StreamChunk};
use anyhow::Result;
use aws_config::Region;
use aws_credential_types::Credentials;
use aws_sdk_bedrockruntime::types::{
    ContentBlock, ConversationRole, InferenceConfiguration, Message, SystemContentBlock,
};
use itertools::Itertools;
use serde_json::Value;
use tokio::sync::mpsc::Sender;

use super::utils::total_cost;

pub const AWS_REGION: &str = "AWS_REGION";
pub const AWS_ACCESS_KEY_ID: &str = "AWS_ACCESS_KEY_ID";
pub const AWS_SECRET_ACCESS_KEY: &str = "AWS_SECRET_ACCESS_KEY";

#[derive(Clone, Debug)]
pub struct AnthropicBedrock {
    client: aws_sdk_bedrockruntime::Client,
}

impl AnthropicBedrock {
    pub fn new(client: aws_sdk_bedrockruntime::Client) -> Self {
        Self { client }
    }
}

impl ExecuteChatCompletion for AnthropicBedrock {
    async fn chat_completion(
        &self,
        model: &str,
        _provider_name: LanguageModelProviderName,
        messages: &Vec<ChatMessage>,
        params: &Value,
        env: &HashMap<String, String>,
        tx: Option<Sender<StreamChunk>>,
        node_info: &NodeInfo,
    ) -> Result<ChatCompletion> {
        let params = serde_json::from_value::<HashMap<String, Value>>(params.clone())?;
        let mut inference_config_builder = InferenceConfiguration::builder().max_tokens(4096);

        if let Some(value) = params.get("max_tokens") {
            inference_config_builder =
                inference_config_builder.max_tokens(value.as_u64().unwrap() as i32);
        }

        if let Some(value) = params.get("temperature") {
            inference_config_builder =
                inference_config_builder.temperature(value.as_f64().unwrap() as f32);
        }

        if let Some(value) = params.get("top_p") {
            inference_config_builder =
                inference_config_builder.top_p(value.as_f64().unwrap() as f32);
        }

        let inference_config = inference_config_builder.build();

        let mut system_message = messages
            .iter()
            .filter_map(|m| {
                if m.role == "system" {
                    if let ChatMessageContent::Text(ref content) = m.content {
                        if !content.is_empty() {
                            Some(SystemContentBlock::Text(content.clone()))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();

        let input_messages = if messages.len() == 1 && messages.first().unwrap().role == "system" {
            system_message = vec![];

            // Anthropic requires at least one user message
            vec![Message::builder()
                .content(ContentBlock::Text(
                    match messages.first().unwrap().content {
                        ChatMessageContent::Text(ref content) => content.clone(),
                        _ => {
                            return Err(anyhow::anyhow!(
                                "Only string messages are supported for Anthropic Bedrock"
                            ))
                        } // TODO: Handle other content types
                    },
                ))
                .role(ConversationRole::User)
                .build()
                .unwrap()]
        } else {
            messages
                .iter()
                .filter_map(|m| match m.role.as_str() {
                    "user" => Some(
                        Message::builder()
                            .content(ContentBlock::Text(match m.content {
                                ChatMessageContent::Text(ref content) => content.clone(),
                                _ => {
                                    panic!("Only string content is supported for Anthropic Bedrock")
                                }
                            }))
                            .role(ConversationRole::User)
                            .build()
                            .unwrap(),
                    ),
                    "assistant" => Some(
                        Message::builder()
                            .content(ContentBlock::Text(match m.content {
                                ChatMessageContent::Text(ref content) => content.clone(),
                                _ => {
                                    panic!("Only string content is supported for Anthropic Bedrock")
                                }
                            }))
                            .role(ConversationRole::Assistant)
                            .build()
                            .unwrap(),
                    ),
                    "system" | _ => None,
                })
                .collect::<Vec<_>>()
        };

        let region = env
            .get(AWS_REGION)
            .cloned()
            .unwrap_or("us-east-1".to_string());

        let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
            .credentials_provider(Credentials::new(
                env.get("AWS_ACCESS_KEY_ID").unwrap(),
                env.get("AWS_SECRET_ACCESS_KEY").unwrap(),
                None,
                None,
                "",
            ))
            .region(Region::new(region))
            .load()
            .await;

        if let Some(tx) = tx {
            let mut request = self
                .client
                .converse_stream()
                .model_id(model.to_string())
                .set_messages(Some(input_messages.to_owned()))
                .set_inference_config(Some(inference_config));
            if !system_message.is_empty() {
                request = request.set_system(Some(system_message));
            }

            let res = request
                .customize()
                .config_override(&config)
                .send()
                .await
                .map_err(|err| err.into_service_error())?;
            let mut stream = res.stream;

            let mut prompt_tokens = 0;
            let mut completion_tokens = 0;
            let mut total_tokens = 0;
            let mut message = String::new();

            while let Ok(Some(chunk)) = stream.recv().await {
                if chunk.is_content_block_delta() {
                    let text = chunk
                        .as_content_block_delta()
                        .unwrap()
                        .delta()
                        .unwrap()
                        .as_text()
                        .unwrap();

                    let stream_chunk = StreamChunk::NodeChunk(NodeStreamChunk {
                        id: node_info.id,
                        node_id: node_info.node_id.clone(),
                        node_name: node_info.node_name.clone(),
                        node_type: node_info.node_type.clone(),
                        content: text.clone().into(),
                    });
                    tx.send(stream_chunk).await.unwrap();

                    message.extend(text.chars());
                } else if chunk.is_metadata() {
                    let metadata: &aws_sdk_bedrockruntime::types::ConverseStreamMetadataEvent =
                        chunk.as_metadata().unwrap();
                    prompt_tokens += metadata.usage().unwrap().input_tokens() as u32;
                    completion_tokens += metadata.usage().unwrap().output_tokens() as u32;
                    total_tokens += metadata.usage().unwrap().total_tokens() as u32;
                }
            }

            let estimated_cost = self.estimate_cost(model, completion_tokens, prompt_tokens);

            let completion = ChatCompletion {
                choices: vec![ChatChoice::new(ChatMessage {
                    role: "assistant".to_string(),
                    content: ChatMessageContent::Text(message),
                })],
                model: model.to_string(),
                usage: ChatUsage {
                    completion_tokens,
                    prompt_tokens,
                    total_tokens,
                    approximate_cost: estimated_cost,
                },
            };

            Ok(completion)
        } else {
            let mut request = self
                .client
                .converse()
                .set_messages(Some(input_messages.to_owned()))
                .model_id(model.to_string())
                .set_inference_config(Some(inference_config));

            if !system_message.is_empty() {
                request = request.set_system(Some(system_message));
            }

            let res = request
                .customize()
                .config_override(&config)
                .send()
                .await
                .map_err(|err| err.into_service_error())?;

            let body = res.output.clone().unwrap();
            let content = body.as_message().unwrap();
            let usage = res.usage().unwrap();

            let approximate_cost =
                self.estimate_cost(model, usage.output_tokens as u32, usage.input_tokens as u32);

            let completion = ChatCompletion {
                choices: vec![ChatChoice::new(ChatMessage {
                    role: "assistant".to_string(),
                    content: ChatMessageContent::Text(
                        content
                            .content()
                            .iter()
                            .map(|block| block.as_text().unwrap())
                            .join(""),
                    ),
                })],
                model: model.to_string(),
                usage: ChatUsage {
                    completion_tokens: usage.output_tokens as u32,
                    prompt_tokens: usage.input_tokens as u32,
                    total_tokens: usage.total_tokens as u32,
                    approximate_cost,
                },
            };

            Ok(completion)
        }
    }

    fn estimate_cost(
        &self,
        model: &str,
        completion_tokens: u32,
        prompt_tokens: u32,
    ) -> Option<f64> {
        if model.contains("claude-3-haiku") {
            Some(total_cost(prompt_tokens, completion_tokens, 0.25, 1.25))
        } else if model.contains("claude-3-sonnet") {
            Some(total_cost(prompt_tokens, completion_tokens, 3.0, 15.0))
        } else if model.contains("claude-3-opus") {
            Some(total_cost(prompt_tokens, completion_tokens, 15.0, 75.0))
        } else if model.contains("claude-3-5-sonnet") {
            Some(total_cost(prompt_tokens, completion_tokens, 3.0, 15.0))
        } else {
            None
        }
    }
}
