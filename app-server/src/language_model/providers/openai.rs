use std::collections::HashMap;

use futures::stream::StreamExt;
use json_value_merge::Merge;

use anyhow::Result;
use log;
use reqwest_eventsource::{Event, EventSource};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tiktoken_rs::get_bpe_from_tokenizer;
use tiktoken_rs::tokenizer::get_tokenizer;
use tokio::sync::mpsc::Sender;

use crate::language_model::{
    ChatChoice, ChatCompletion, ChatMessage, ChatMessageContent, ChatMessageContentPart, ChatUsage,
    LanguageModelProviderName, NodeInfo,
};

use crate::language_model::runner::ExecuteChatCompletion;
use crate::pipeline::nodes::{NodeStreamChunk, StreamChunk};

use super::utils::total_cost;

#[derive(Clone, Debug)]
pub struct OpenAI {
    client: reqwest::Client,
}

impl OpenAI {
    pub fn new(client: reqwest::Client) -> Self {
        Self { client }
    }
}

#[derive(Debug, Deserialize)]
struct OpenAIChatCompletion {
    choices: Vec<OpenAIChatChoice>,
    usage: ChatUsage,
    model: String,
}

#[derive(Debug, Deserialize)]
struct OpenAIChatChoice {
    message: OpenAIChatMessage,
}

#[derive(Debug, Deserialize, Serialize, Default)]
struct OpenAIToolCallFunction {
    // Is required overall, but not sent in subsequent streaming chunks
    #[serde(default)]
    name: Option<String>,
    arguments: String,
}

#[derive(Debug, Deserialize, Serialize, Default)]
struct OpenAIToolCall {
    #[serde(default)]
    index: Option<i64>,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    #[serde(rename = "type")]
    tool_type: Option<String>, // is always "function"
    function: OpenAIToolCallFunction,
}

#[derive(Debug, Deserialize)]
struct OpenAIChatMessage {
    role: String,
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<OpenAIToolCall>>,
}

#[derive(Debug, Deserialize)]
struct OpenAIErrorMessage {
    message: String,
}

#[derive(Debug, Deserialize)]
struct OpenAIError {
    error: OpenAIErrorMessage,
}

#[derive(Debug, Deserialize)]
pub struct ChatChunkDelta {
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<OpenAIToolCall>>,
}

#[derive(Debug, Deserialize)]
pub struct ChatChunkChoice {
    pub delta: ChatChunkDelta,
}

#[derive(Debug, Deserialize)]
pub struct ChatCompletionChunk {
    pub choices: Vec<ChatChunkChoice>,
    #[serde(default)] // TODO: seems like this `default` is not needed
    pub model: Option<String>,
}

pub fn num_tokens_from_messages(model: &str, messages: &Vec<ChatMessage>) -> Result<u32> {
    let tokenizer = get_tokenizer(model).ok_or(anyhow::anyhow!("Tokenizer not found"))?;
    let bpe = get_bpe_from_tokenizer(tokenizer)?;
    let tokens_per_message = if model.starts_with("gpt-3.5") {
        4 // every message follows <im_start>{role/name}\n{content}<im_end>\n
    } else {
        3
    };
    let mut num_tokens: u32 = 0;
    for message in messages {
        num_tokens += tokens_per_message;
        num_tokens += bpe.encode_with_special_tokens(&message.role).len() as u32;
        match message.content {
            ChatMessageContent::Text(ref content) => {
                num_tokens += bpe.encode_with_special_tokens(content).len() as u32;
            }
            ChatMessageContent::ContentPartList(ref content_parts) => {
                for content_part in content_parts {
                    match content_part {
                        ChatMessageContentPart::Text(ref content) => {
                            num_tokens +=
                                bpe.encode_with_special_tokens(&content.text).len() as u32;
                        }
                        // TODO: Figure out how to handle images and image urls for OpenAI streaming
                        ChatMessageContentPart::Image(ref image) => {
                            num_tokens += 1; // start tag
                            num_tokens += bpe.encode_with_special_tokens(&image.data).len() as u32;
                            num_tokens += 1; // end tag
                        }
                        ChatMessageContentPart::ImageUrl(ref image_url) => {
                            num_tokens += 1; // start tag
                            num_tokens +=
                                bpe.encode_with_special_tokens(&image_url.url).len() as u32;
                            num_tokens += 1; // end tag
                        }
                    }
                }
            }
        }
    }
    num_tokens += 3; // every reply is primed with <|start|>assistant<|message|>
    Ok(num_tokens)
}

/// Convert to OpenAI message
///
/// This functions is mainly needed to convert the images to correct format
///
/// TODO: This must convert to special OpenAI structs and later serialized by Serde
fn to_value(message: &ChatMessage) -> Value {
    match &message.content {
        ChatMessageContent::Text(text) => json!({
            "role": message.role,
            "content": text,
        }),
        ChatMessageContent::ContentPartList(parts) => {
            let parts: Vec<Value> = parts
                .into_iter()
                .map(|part| match part {
                    ChatMessageContentPart::Text(text) => json!({
                        "type": "text",
                        "text": text.text,
                    }),
                    ChatMessageContentPart::ImageUrl(image_url) => json!({
                        "type": "image_url",
                        "image_url": {
                            "url": image_url.url,
                        }
                    }),
                    ChatMessageContentPart::Image(image) => json!({
                        "type": "image_url",
                        "image_url": {
                            "url": format!("data:{};base64,{}", image.media_type, image.data),
                        }
                    }),
                })
                .collect();
            json!({
                "role": message.role,
                "content": parts,
            })
        }
    }
}

impl ExecuteChatCompletion for OpenAI {
    async fn chat_completion(
        &self,
        model: &str,
        provider_name: LanguageModelProviderName,
        messages: &Vec<ChatMessage>,
        params: &Value,
        env: &HashMap<String, String>,
        tx: Option<Sender<StreamChunk>>,
        node_info: &NodeInfo,
    ) -> Result<ChatCompletion> {
        let json_messages: Vec<Value> = messages.iter().map(|message| to_value(message)).collect();

        let mut body = json!({
            "model": model,
            "messages": json_messages,
        });

        body.merge(params);

        let api_key = provider_name.api_key(env)?;

        let endpoint = "https://api.openai.com/v1/chat/completions";

        if let Some(tx) = tx {
            body["stream"] = Value::Bool(true);

            let req = self
                .client
                .post(endpoint)
                .body(body.to_string())
                .header("Content-Type", "application/json")
                .bearer_auth(api_key);
            let mut eventsource = EventSource::new(req)?;

            let mut message = String::new();
            let prompt_tokens = num_tokens_from_messages(model, messages).unwrap_or(0);
            let mut completion_tokens = 0;
            let mut tool_calls: Vec<OpenAIToolCall> = Vec::new();

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
                            log::error!("Error on OpenAI streaming: {}", e);
                            return Err(anyhow::anyhow!("Error on OpenAI streaming"));
                        }
                    },
                };

                // Check if the stream is complete
                if item == "[DONE]" {
                    break;
                }

                // Parse the json data
                let chunk = serde_json::from_str::<ChatCompletionChunk>(&item)?;

                let chunk_content = chunk.choices.get(0).unwrap();
                if let Some(content) = &chunk_content.delta.content {
                    let content = content.clone();
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

                if let Some(tool_calls_chunk) = &chunk_content.delta.tool_calls {
                    tool_calls_chunk.iter().for_each(|tool_call_chunk| {
                        if let Some(index) = tool_call_chunk.index {
                            // if nth tool chunk arrives earlier, fill the gap with default tool calls
                            // up to and including n
                            if index >= tool_calls.len() as i64 {
                                for _ in 0..=(index - tool_calls.len() as i64) {
                                    tool_calls.push(OpenAIToolCall::default());
                                }
                            }
                            let tool_call = tool_calls.get_mut(index as usize).unwrap();
                            if let Some(id) = tool_call_chunk.id.as_ref() {
                                tool_call.id = Some(id.clone());
                            }
                            if let Some(tool_type) = tool_call_chunk.tool_type.as_ref() {
                                tool_call.tool_type = Some(tool_type.clone());
                            }
                            if let Some(name) = tool_call_chunk.function.name.as_ref() {
                                if let Some(existing_name) = tool_call.function.name.as_ref() {
                                    tool_call.function.name =
                                        Some(format!("{}{}", existing_name, name));
                                } else {
                                    tool_call.function.name = Some(name.clone());
                                }
                            }
                            tool_call
                                .function
                                .arguments
                                .extend(tool_call_chunk.function.arguments.chars());
                        }
                    });
                }
            }

            eventsource.close();

            // if tools are provided, override output with tool call objects
            if !tool_calls.is_empty() {
                message = serde_json::to_string_pretty(&tool_calls).unwrap();
            }

            let chat_message = ChatMessage {
                role: "assistant".to_string(),
                content: ChatMessageContent::Text(message),
            };

            let chat_choice = ChatChoice::new(chat_message);

            let chat_completion = ChatCompletion {
                choices: vec![chat_choice],
                usage: ChatUsage {
                    completion_tokens,
                    prompt_tokens,
                    total_tokens: completion_tokens + prompt_tokens,
                    approximate_cost: self.estimate_cost(model, completion_tokens, prompt_tokens),
                },
                model: model.to_string(),
            };

            Ok(chat_completion)
        } else {
            let res = self
                .client
                .post(endpoint)
                .header("Content-Type", "application/json")
                .bearer_auth(api_key)
                .json(&body)
                .send()
                .await?;

            if res.status() != 200 {
                let res_body = res.json::<OpenAIError>().await?;
                return Err(anyhow::anyhow!(res_body.error.message));
            }

            let mut res_body = res.json::<OpenAIChatCompletion>().await?;
            res_body.usage.approximate_cost = self.estimate_cost(
                model,
                res_body.usage.completion_tokens,
                res_body.usage.prompt_tokens,
            );

            let chat_completion = ChatCompletion {
                choices: res_body
                    .choices
                    .iter()
                    .map(|choice| {
                        // if content is None, use tool_calls as content
                        let content = if choice.message.content.is_none()
                            && choice.message.tool_calls.is_some()
                        {
                            serde_json::to_string_pretty(
                                choice.message.tool_calls.as_ref().unwrap(),
                            )
                            .unwrap()
                        } else {
                            choice.message.content.clone().unwrap()
                        };
                        let message = ChatMessage {
                            role: choice.message.role.clone(),
                            content: ChatMessageContent::Text(content),
                        };

                        ChatChoice::new(message)
                    })
                    .collect(),
                usage: res_body.usage,
                model: res_body.model,
            };

            Ok(chat_completion)
        }
    }

    fn estimate_cost(
        &self,
        model: &str,
        completion_tokens: u32,
        prompt_tokens: u32,
    ) -> Option<f64> {
        let model = model.to_lowercase();
        if model.starts_with("gpt-3.5") {
            Some(total_cost(prompt_tokens, completion_tokens, 0.5, 1.5))
        } else if model.starts_with("gpt-4-turbo") {
            Some(total_cost(prompt_tokens, completion_tokens, 10.0, 30.0))
        } else if model.starts_with("gpt-4o-mini") {
            Some(total_cost(prompt_tokens, completion_tokens, 0.15, 0.6))
        } else if model.starts_with("gpt-4o") {
            Some(total_cost(prompt_tokens, completion_tokens, 5.0, 15.0))
        } else {
            None
        }
    }
}
