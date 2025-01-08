use std::collections::HashMap;
use std::sync::Arc;

use crate::cache::Cache;
use crate::db::DB;
use crate::language_model::chat_message::{ChatChoice, ChatCompletion, ChatMessage, ChatUsage};
use crate::language_model::runner::ExecuteChatCompletion;
use crate::language_model::{
    ChatMessageContent, ChatMessageContentPart, EstimateCost, LanguageModelProviderName, NodeInfo,
};
use crate::pipeline::nodes::{NodeStreamChunk, StreamChunk};
use anyhow::Result;
use futures::stream::StreamExt;
use json_value_merge::Merge;
use reqwest_eventsource::{Event, EventSource};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::mpsc::Sender;

#[derive(Clone, Debug)]
pub struct Anthropic {
    client: reqwest::Client,
}

impl Anthropic {
    pub fn new(client: reqwest::Client) -> Self {
        Self { client }
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct AnthropicResponseUsage {
    output_tokens: u32,
    input_tokens: u32,
}

#[derive(Serialize, Deserialize, Debug)]
struct AnthropicResponseContentBlock {
    #[serde(rename = "type")]
    type_field: String,
    text: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct AnthropicResponse {
    usage: AnthropicResponseUsage,
    content: Vec<AnthropicResponseContentBlock>,
    model: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
enum ChatCompletionChunk {
    MessageStart(MessageStart),
    ContentBlockDelta(ContentBlockDelta),
    MessageStop,
}

#[derive(Debug, Deserialize)]
struct MessageStart {
    message: MessageStartMessage,
}

#[derive(Debug, Deserialize)]

struct MessageStartMessage {
    usage: Usage,
}

#[derive(Debug, Deserialize)]

struct Usage {
    input_tokens: u32,
}

#[derive(Debug, Deserialize)]
pub struct ContentBlockDelta {
    pub delta: Delta,
}

#[derive(Debug, Deserialize)]
pub struct Delta {
    pub text: String,
}

impl TryFrom<AnthropicResponse> for ChatCompletion {
    type Error = anyhow::Error;

    fn try_from(value: AnthropicResponse) -> Result<Self> {
        let usage = ChatUsage {
            completion_tokens: value.usage.output_tokens,
            prompt_tokens: value.usage.input_tokens,
            total_tokens: value.usage.input_tokens + value.usage.output_tokens,
            approximate_cost: None,
        };

        let choices = value
            .content
            .into_iter()
            .map(|content_block| {
                ChatChoice::new(ChatMessage {
                    role: String::from("assistant"),
                    content: ChatMessageContent::Text(content_block.text),
                })
            })
            .collect();

        Ok(ChatCompletion::new(choices, usage, value.model))
    }
}

/// Convert to Anthropic message
///
/// This functions is mainly needed to convert the images to correct format
fn to_value(message: &ChatMessage) -> Result<Value> {
    match &message.content {
        ChatMessageContent::Text(text) => Ok(json!({
            "role": message.role,
            "content": text,
        })),
        ChatMessageContent::ContentPartList(parts) => {
            let mut json_parts: Vec<Value> = Vec::new();
            for part in parts.into_iter() {
                match part {
                    ChatMessageContentPart::Text(text) => json_parts.push(json!({
                        "type": "text",
                        "text": text.text,
                    })),
                    ChatMessageContentPart::ImageUrl(_image_url) => {
                        return Err(anyhow::anyhow!(
                            "Image URL is not supported in Anthropic models"
                        ))
                    }
                    ChatMessageContentPart::Image(image) => json_parts.push(json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": image.media_type,
                            "data": image.data,
                        }
                    })),
                    ChatMessageContentPart::Document(document) => json_parts.push(json!({
                        "type": "document",
                        "document": {
                            "source": {
                                "type": document.source.document_type,
                                "media_type": document.source.media_type,
                                "data": document.source.data,
                            }
                        }
                    })),
                    ChatMessageContentPart::DocumentUrl(_) => {
                        return Err(anyhow::anyhow!("Document URL is Laminar's internal format"))
                    }
                }
            }

            Ok(json!({
                "role": message.role,
                "content": json_parts,
            }))
        }
    }
}

impl ExecuteChatCompletion for Anthropic {
    async fn chat_completion(
        &self,
        model: &str,
        provider_name: LanguageModelProviderName,
        messages: &Vec<ChatMessage>,
        params: &Value,
        env: &HashMap<String, String>,
        tx: Option<Sender<StreamChunk>>,
        node_info: &NodeInfo,
        db: Arc<DB>,
        cache: Arc<Cache>,
    ) -> Result<ChatCompletion> {
        let mut body = json!({
            "model": model,
            "max_tokens": 4096,
        });

        body.merge(params);

        if messages[0].role == "system" && messages.len() == 1 {
            // Anthropic requires at least one user message
            let user_message = ChatMessage {
                role: "user".to_string(),
                content: messages[0].content.clone(),
            };
            let json_user_message = to_value(&user_message)?;
            body["messages"] = serde_json::json!(vec![json_user_message]);
        } else {
            body["system"] = serde_json::json!(messages[0].content);

            let messages = messages
                .iter()
                .skip(1)
                .map(|message| to_value(message))
                .collect::<Result<Vec<Value>>>()?;
            body["messages"] = serde_json::json!(messages);
        }

        if tx.is_some() {
            body["stream"] = Value::Bool(true);
        }

        let api_key = provider_name.api_key(env)?;

        if let Some(tx) = tx {
            let req = self
                .client
                .post("https://api.anthropic.com/v1/messages")
                .body(body.to_string())
                .header("Content-Type", "application/json")
                .header("Anthropic-Version", "2023-06-01") // Version must be updated regularly
                .header("X-Api-Key", api_key);
            let mut eventsource = EventSource::new(req)?;

            let mut message = String::new();
            let mut prompt_tokens = 0;
            let mut completion_tokens = 0;

            while let Some(event) = eventsource.next().await {
                let item = match event {
                    Ok(Event::Message(event)) => event.data,
                    Ok(Event::Open) => continue,
                    Err(e) => match e {
                        reqwest_eventsource::Error::InvalidStatusCode(status, _) => {
                            // handle separately to not display SET-COOKIE header from response
                            if matches!(status, reqwest::StatusCode::UNAUTHORIZED) {
                                return Err(anyhow::anyhow!("Invalid API key"));
                            } else {
                                return Err(anyhow::anyhow!("Error. Status code: {}", status));
                            };
                        }
                        _ => {
                            log::error!("Error on Anthropic streaming: {}", e);
                            return Err(anyhow::anyhow!("Error on anthropic streaming"));
                        }
                    },
                };

                let chunk = serde_json::from_str::<ChatCompletionChunk>(&item);

                if chunk.is_err() {
                    continue;
                }

                let chunk = chunk.unwrap();

                match chunk {
                    ChatCompletionChunk::MessageStart(message_start) => {
                        prompt_tokens = message_start.message.usage.input_tokens;
                    }
                    ChatCompletionChunk::ContentBlockDelta(chunk) => {
                        let content = chunk.delta.text;

                        message.extend(content.chars());

                        let stream_chunk = StreamChunk::NodeChunk(NodeStreamChunk {
                            id: node_info.id,
                            node_id: node_info.node_id,
                            node_name: node_info.node_name.clone(),
                            node_type: node_info.node_type.clone(),
                            content: content.into(),
                        });

                        tx.send(stream_chunk).await.unwrap();

                        completion_tokens += 1;
                    }
                    ChatCompletionChunk::MessageStop => {
                        break;
                    }
                }
            }

            let chat_message = ChatMessage {
                role: "assistant".to_string(),
                content: ChatMessageContent::Text(message),
            };

            let chat_choice = ChatChoice::new(chat_message);

            let chat_usage = ChatUsage {
                completion_tokens,
                prompt_tokens,
                total_tokens: completion_tokens + prompt_tokens,
                approximate_cost: self
                    .estimate_cost(db, cache, model, prompt_tokens, completion_tokens)
                    .await,
            };

            let chat_completion = ChatCompletion {
                choices: vec![chat_choice],
                usage: chat_usage,
                model: model.to_string(),
            };

            Ok(chat_completion)
        } else {
            let res = self
                .client
                .post("https://api.anthropic.com/v1/messages")
                .body(body.to_string())
                .header("Content-Type", "application/json")
                .header("Anthropic-Version", "2023-06-01") // Version must be updated regularly
                .header("X-Api-Key", api_key)
                .send()
                .await
                .unwrap();
            if !res.status().is_success() {
                let error = res.text().await?;
                log::error!("Anthropic message request failed: {}", error);
                return Err(anyhow::anyhow!(
                    "Anthropic message request failed: {}",
                    error
                ));
            }

            let res_body = res.json::<AnthropicResponse>().await?;

            let result = res_body.try_into();

            if result.is_err() {
                return result;
            }
            let mut res = result.unwrap();
            res.usage.approximate_cost = self
                .estimate_cost(
                    db,
                    cache,
                    model,
                    res.usage.prompt_tokens,
                    res.usage.completion_tokens,
                )
                .await;
            Ok(res)
        }
    }
}

impl EstimateCost for Anthropic {
    fn db_provider_name(&self) -> &str {
        "anthropic"
    }
}
