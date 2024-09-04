use std::collections::HashMap;

use futures::StreamExt;
use json_value_merge::Merge;

use anyhow::{Context, Result};
use reqwest_eventsource::{Event, EventSource};
use serde_json::{json, Value};

use tokio::sync::mpsc::Sender;

use crate::language_model::chat_message::{ChatCompletion, ChatMessage};

use crate::language_model::runner::ExecuteChatCompletion;
use crate::language_model::{
    ChatChoice, ChatMessageContent, ChatUsage, LanguageModelProviderName, NodeInfo,
};
use crate::pipeline::nodes::{NodeStreamChunk, StreamChunk};

use super::openai::{num_tokens_from_messages, ChatCompletionChunk};
use crate::language_model::providers::utils::calculate_cost;

pub const OPENAI_AZURE_RESOURCE_ID: &str = "OPENAI_AZURE_RESOURCE_ID";
pub const OPENAI_AZURE_DEPLOYMENT_NAME: &str = "OPENAI_AZURE_DEPLOYMENT_NAME";

#[derive(Clone, Debug)]
pub struct OpenAIAzure {
    client: reqwest::Client,
}

impl OpenAIAzure {
    pub fn new(client: reqwest::Client) -> Self {
        Self { client }
    }
}
#[derive(Debug, serde::Deserialize)]
struct OpenAIErrorMessage {
    message: String,
}

#[derive(Debug, serde::Deserialize)]
struct OpenAIError {
    error: OpenAIErrorMessage,
}

impl ExecuteChatCompletion for OpenAIAzure {
    async fn chat_completion(
        &self,
        _model: &str,
        provider_name: LanguageModelProviderName,
        messages: &Vec<ChatMessage>,
        params: &Value,
        env: &HashMap<String, String>,
        tx: Option<Sender<StreamChunk>>,
        node_info: &NodeInfo,
    ) -> Result<ChatCompletion> {
        let mut body = json!({
            "messages": messages,
        });

        body.merge(params);

        let api_key = provider_name.api_key(env)?;

        let endpoint = build_endpoint_name(env)?;

        if let Some(tx) = tx {
            body["stream"] = Value::Bool(true);

            let req = self
                .client
                .post(endpoint)
                .header("Content-Type", "application/json")
                .header("api-key", api_key)
                .json(&body);

            let mut eventsource = EventSource::new(req)?;
            let mut message = String::new();
            // hard-code the model for now
            let prompt_tokens = num_tokens_from_messages("gpt-4o", messages).unwrap();
            let mut completion_tokens = 0;
            let mut model = String::new();

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

                if let Some(mdl) = chunk.model {
                    model = mdl;
                }

                // the first chunk is usually empty
                if chunk.choices.is_empty() {
                    continue;
                }

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
                    approximate_cost: self.estimate_cost(&model, completion_tokens, prompt_tokens),
                },
                model: model.to_string(),
            };

            Ok(chat_completion)
        } else {
            let res = self
                .client
                .post(endpoint)
                .header("Content-Type", "application/json")
                .header("api-key", api_key)
                .json(&body)
                .send()
                .await?;

            if res.status() != 200 {
                let res_body = res.json::<OpenAIError>().await?;
                return Err(anyhow::anyhow!(res_body.error.message));
            }

            let mut res_body = res.json::<ChatCompletion>().await?;

            res_body.usage.approximate_cost = self.estimate_cost(
                &res_body.model,
                res_body.usage.completion_tokens,
                res_body.usage.prompt_tokens,
            );

            Ok(res_body)
        }
    }

    fn estimate_input_cost(&self, model: &str, prompt_tokens: u32) -> Option<f64> {
        let model = model.to_ascii_lowercase();
        let price_per_million_tokens = if model.contains("gpt-4o") {
            5.0
        } else if model.contains("gpt-3.5-turbo") {
            if model.contains("instruct") {
                1.5
            } else {
                0.5
            }
        } else if model.contains("gpt-4-turbo") {
            10.0
        } else if model.contains("gpt-4") {
            if model.contains("8k") {
                30.0
            } else if model.contains("32k") {
                60.0
            } else {
                return None;
            }
        } else if model.contains("babbage") {
            0.4
        } else if model.contains("davinci") {
            2.0
        } else {
            return None;
        };
        Some(calculate_cost(prompt_tokens, price_per_million_tokens))
    }

    fn estimate_output_cost(&self, model: &str, completion_tokens: u32) -> Option<f64> {
        let model = model.to_ascii_lowercase();
        let price_per_million_tokens = if model.contains("gpt-4o") {
            15.0
        } else if model.contains("gpt-3.5-turbo") {
            if model.contains("instruct") {
                2.0
            } else {
                1.5
            }
        } else if model.contains("gpt-4-turbo") {
            30.0
        } else if model.contains("gpt-4") {
            if model.contains("8k") {
                60.0
            } else if model.contains("32k") {
                120.0
            } else {
                return None;
            }
        } else if model.contains("babbage") {
            0.4
        } else if model.contains("davinci") {
            2.0
        } else {
            return None;
        };
        Some(calculate_cost(completion_tokens, price_per_million_tokens))
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

fn build_endpoint_name(env: &HashMap<String, String>) -> Result<String> {
    let resource_id = env
        .get(&String::from(OPENAI_AZURE_RESOURCE_ID))
        .map(ToOwned::to_owned)
        .context("Env doesn't contain Azure endpoint")?;

    let deployment_name = env
        .get(&String::from(OPENAI_AZURE_DEPLOYMENT_NAME))
        .map(ToOwned::to_owned)
        .context("Env doesn't contain Azure deployment name")?;

    Ok(format!(
        "https://{}.openai.azure.com/openai/deployments/{}/chat/completions?api-version=2024-02-01",
        resource_id, deployment_name
    ))
}
