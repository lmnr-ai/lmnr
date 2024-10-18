use std::{collections::HashMap, sync::Arc};

use futures::StreamExt;
use json_value_merge::Merge;

use anyhow::Result;
use reqwest_eventsource::{Event, EventSource};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::mpsc::Sender;

use crate::{
    cache::Cache,
    db::DB,
    language_model::{
        chat_message::{ChatCompletion, ChatMessage},
        ChatChoice, ChatMessageContent, ChatUsage, EstimateCost, ExecuteChatCompletion,
        LanguageModelProviderName, NodeInfo,
    },
    pipeline::nodes::{NodeStreamChunk, StreamChunk},
};

#[derive(Clone, Debug)]
pub struct Groq {
    client: reqwest::Client,
}

impl Groq {
    pub fn new(client: reqwest::Client) -> Self {
        Self { client }
    }
}
#[derive(Debug, serde::Deserialize)]
struct GroqErrorMessage {
    message: String,
}

#[derive(Debug, serde::Deserialize)]
struct GroqError {
    error: GroqErrorMessage,
}

#[derive(Debug, Deserialize)]
pub struct ChatChunkDelta {
    pub content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChatChunkChoice {
    pub delta: ChatChunkDelta,
}

#[derive(Debug, Deserialize)]
pub struct ChatCompletionChunk {
    pub choices: Vec<ChatChunkChoice>,
}

impl ExecuteChatCompletion for Groq {
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
            "messages": messages,
        });

        body.merge(params);

        let api_key = provider_name.api_key(env)?;

        let endpoint = "https://api.groq.com/openai/v1/chat/completions";

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

            let cloned_messages = messages.clone();
            let prompt_tokens_counter = tokio::spawn(async move {
                // Tokenizing with openai's tokenizer here is somewhat arbitrary,
                // and probably inaccurate, but it's better than nothing
                super::openai::num_tokens_from_messages("gpt-4o", &cloned_messages)
            });
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
                            log::error!("Error on Groq streaming: {}", e);
                            return Err(anyhow::anyhow!("Error on Groq streaming"));
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
            }
            eventsource.close();

            let chat_message = ChatMessage {
                role: "system".to_string(),
                content: ChatMessageContent::Text(message),
            };

            let chat_choice = ChatChoice::new(chat_message);
            let prompt_tokens = prompt_tokens_counter.await.unwrap().unwrap_or(0);

            let chat_completion = ChatCompletion {
                choices: vec![chat_choice],
                usage: ChatUsage {
                    completion_tokens,
                    prompt_tokens,
                    total_tokens: completion_tokens + prompt_tokens,
                    approximate_cost: self
                        .estimate_cost(db, cache, model, prompt_tokens, completion_tokens)
                        .await,
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
                let res_body = res.json::<GroqError>().await?;
                return Err(anyhow::anyhow!(res_body.error.message));
            }

            let mut res_body = res.json::<ChatCompletion>().await?;
            res_body.usage.approximate_cost = self
                .estimate_cost(
                    db,
                    cache,
                    model,
                    res_body.usage.prompt_tokens,
                    res_body.usage.completion_tokens,
                )
                .await;

            Ok(res_body)
        }
    }
}

impl EstimateCost for Groq {
    fn db_provider_name(&self) -> &str {
        "groq"
    }
}
