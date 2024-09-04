use std::collections::HashMap;

use anyhow::Result;
use futures::stream::StreamExt;
use reqwest_eventsource::{Event, EventSource};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::mpsc::Sender;

use crate::{
    language_model::{
        chat_message::{ChatCompletion, ChatMessage},
        ChatChoice, ChatMessageContent, ChatMessageContentPart, ChatUsage, ExecuteChatCompletion,
        LanguageModelProviderName, NodeInfo,
    },
    pipeline::nodes::{NodeStreamChunk, StreamChunk},
};

use crate::language_model::providers::utils::calculate_cost;

#[derive(Clone, Debug)]
pub struct Gemini {
    client: reqwest::Client,
}

impl Gemini {
    pub fn new(client: reqwest::Client) -> Self {
        Self { client }
    }
}
#[derive(Debug, serde::Deserialize)]
struct GeminiErrorMessage {
    // code: i32,
    message: String,
    // status: String,
}

#[derive(Debug, serde::Deserialize)]
struct GeminiError {
    error: GeminiErrorMessage,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    text: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Content {
    pub parts: Vec<Part>,
    pub role: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub content: Content,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageMetadata {
    pub candidates_token_count: u32,
    pub prompt_token_count: u32,
    pub total_token_count: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiResponse {
    pub candidates: Vec<Candidate>,
    pub usage_metadata: UsageMetadata,
}

fn to_content(message: ChatMessage) -> Content {
    Content {
        parts: vec![Part {
            text: match message.content {
                ChatMessageContent::Text(text) => text,
                ChatMessageContent::ContentPartList(parts) => parts
                    .iter()
                    .map(|part| match part {
                        ChatMessageContentPart::Text(text) => text.text.clone(),
                        _ => {
                            panic!("We don't support images for Gemini yet")
                        }
                    })
                    .collect::<Vec<String>>()
                    .join(""),
            },
        }],
        role: if message.role == "user" {
            "user".to_string()
        } else {
            "model".to_string() // "assistant" is turned into "model"
        },
    }
}

fn to_chat_completion(res: GeminiResponse, model: &str) -> ChatCompletion {
    // Extract like this to avoid cloning because we already own "res"
    let candidate = res
        .candidates
        .into_iter()
        .next()
        .expect("No candidates found");
    let part = candidate
        .content
        .parts
        .into_iter()
        .next()
        .expect("No parts found");

    ChatCompletion {
        choices: vec![ChatChoice::new(ChatMessage {
            role: candidate.content.role,
            content: ChatMessageContent::Text(part.text),
        })],
        usage: ChatUsage {
            completion_tokens: res.usage_metadata.candidates_token_count,
            prompt_tokens: res.usage_metadata.prompt_token_count,
            total_tokens: res.usage_metadata.total_token_count,
            approximate_cost: None,
        },
        model: model.to_string(),
    }
}

/// Implementation of the `ExecuteChatCompletion` trait for the Gemini provider.
///
/// Good references:
/// - https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference (general)
/// - https://github.com/google-gemini/cookbook/blob/main/quickstarts/rest/Streaming_REST.ipynb (streaming)
impl ExecuteChatCompletion for Gemini {
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
        let mut body = json!({});

        if messages[0].role == "system" {
            if messages.len() == 1 {
                // In case there is only 1 system message, convert it to user message
                body["contents"] =
                    json!([{ "parts": [{ "text": messages[0].content }], "role": "user" }]);
            } else {
                body["system_instruction"] = json!({"parts": [{"text": messages[0].content}]});
                body["contents"] = json!(messages[1..]
                    .iter()
                    .map(|m| to_content(m.clone()))
                    .collect::<Vec<_>>());
            }
        } else {
            body["contents"] = json!(messages
                .iter()
                .map(|m| to_content(m.clone()))
                .collect::<Vec<_>>());
        }

        body["generation_config"] = params.clone();

        let api_key = provider_name.api_key(env)?;

        if let Some(tx) = tx {
            let endpoint = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?key={}&alt=sse",
                model, api_key
            );

            let req = self
                .client
                .post(endpoint)
                .header("Content-Type", "application/json")
                .json(&body);
            let mut eventsource = EventSource::new(req)?;

            let mut message = String::new();
            let mut prompt_tokens = 0;
            let mut completion_tokens = 0;

            while let Some(event) = eventsource.next().await {
                let item = match event {
                    Ok(Event::Message(event)) => event.data,
                    Ok(Event::Open) => continue,
                    Err(e) => match e {
                        reqwest_eventsource::Error::StreamEnded => {
                            break;
                        }
                        reqwest_eventsource::Error::InvalidStatusCode(status, _) => {
                            // handle separately to not display SET-COOKIE header from response
                            if matches!(status, reqwest::StatusCode::UNAUTHORIZED) {
                                return Err(anyhow::anyhow!("Invalid API key"));
                            } else {
                                return Err(anyhow::anyhow!("Error. Status code: {}", status));
                            };
                        }
                        _ => {
                            log::error!("Error on Gemini streaming: {}", e);
                            return Err(anyhow::anyhow!("Error on Gemini streaming"));
                        }
                    },
                };

                // Not needed, since Gemini stream throws StreamEnded, but just for safety
                if item == "[DONE]" {
                    break;
                }

                let partial_response = serde_json::from_str::<GeminiResponse>(&item)?;
                for candidate in partial_response.candidates {
                    for part in candidate.content.parts {
                        message.push_str(&part.text);

                        let stream_chunk = StreamChunk::NodeChunk(NodeStreamChunk {
                            id: node_info.id,
                            node_id: node_info.node_id,
                            node_name: node_info.node_name.clone(),
                            node_type: node_info.node_type.clone(),
                            content: part.text.into(),
                        });

                        tx.send(stream_chunk).await.unwrap();
                    }
                }

                // The same value is always returned for prompt tokens
                prompt_tokens = partial_response.usage_metadata.prompt_token_count;
                // The completion tokens are updated with the latest value
                completion_tokens = partial_response.usage_metadata.candidates_token_count;
            }

            eventsource.close();

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
            let endpoint = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                model, api_key
            );

            let res = self
                .client
                .post(endpoint)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await?;

            let status = res.status();
            if status != 200 {
                let res_body = res.json::<GeminiError>().await?;
                return Err(anyhow::anyhow!(
                    "Status: {}, Error:\n{}",
                    status,
                    res_body.error.message
                ));
            }

            let res_body = res.json::<GeminiResponse>().await?;
            let mut completion = to_chat_completion(res_body, model);

            completion.usage.approximate_cost = self.estimate_cost(
                model,
                completion.usage.completion_tokens,
                completion.usage.prompt_tokens,
            );

            Ok(completion)
        }
    }

    fn estimate_input_cost(&self, model: &str, prompt_tokens: u32) -> Option<f64> {
        let input_price_per_million_tokens = match model.to_lowercase().as_str() {
            "gemini-1.5-flash" => {
                if prompt_tokens <= 128_000 {
                    0.35
                } else {
                    0.70
                }
            }
            "gemini-1.5-pro" => {
                if prompt_tokens <= 128_000 {
                    3.5
                } else {
                    7.0
                }
            }
            _ => return None,
        };
        Some(calculate_cost(
            prompt_tokens,
            input_price_per_million_tokens,
        ))
    }

    fn estimate_output_cost(&self, model: &str, completion_tokens: u32) -> Option<f64> {
        let output_price_per_million_tokens = match model.to_lowercase().as_str() {
            "gemini-1.5-flash" => {
                if completion_tokens <= 128_000 {
                    1.05
                } else {
                    2.10
                }
            }
            "gemini-1.5-pro" => {
                if completion_tokens <= 128_000 {
                    10.50
                } else {
                    21.00
                }
            }
            _ => return None,
        };
        Some(calculate_cost(
            completion_tokens,
            output_price_per_million_tokens,
        ))
    }

    fn estimate_cost(
        &self,
        model: &str,
        completion_tokens: u32,
        prompt_tokens: u32,
    ) -> Option<f64> {
        let input_cost = self.estimate_input_cost(model, prompt_tokens)?;
        let output_cost = self.estimate_output_cost(model, completion_tokens)?;
        Some(input_cost + output_cost)
    }
}
