use std::collections::HashMap;
use std::sync::Arc;

use crate::cache::Cache;
use crate::db::DB;
use crate::language_model::chat_message::{ChatCompletion, ChatMessage};
use crate::language_model::runner::ExecuteChatCompletion;
use crate::language_model::{EstimateCost, LanguageModelProviderName, NodeInfo};
use crate::pipeline::nodes::StreamChunk;
use anyhow::Result;
use json_value_merge::Merge;
use serde_json::{json, Value};
use tokio::sync::mpsc::Sender;

#[derive(Clone, Debug)]
pub struct Mistral {
    client: reqwest::Client,
}

impl Mistral {
    pub fn new(client: reqwest::Client) -> Self {
        Self { client }
    }
}

impl ExecuteChatCompletion for Mistral {
    async fn chat_completion(
        &self,
        model: &str,
        provider_name: LanguageModelProviderName,
        messages: &Vec<ChatMessage>,
        params: &Value,
        env: &HashMap<String, String>,
        _tx: Option<Sender<StreamChunk>>,
        _node_info: &NodeInfo,
        db: Arc<DB>,
        cache: Arc<Cache>,
    ) -> Result<ChatCompletion> {
        let mut body = json!({
            "model": model,
            "messages": messages,
        });

        body.merge(params);

        let api_key = provider_name.api_key(env)?;

        let res = self
            .client
            .post("https://api.mistral.ai/v1/chat/completions")
            .header("Content-Type", "application/json")
            .bearer_auth(api_key)
            .json(&body)
            .send()
            .await?;

        if !res.status().is_success() {
            let error = res.text().await?;
            log::error!("Mistral chat completion failed: {}", error);
            return Err(anyhow::anyhow!("Mistral chat completion failed: {}", error));
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

impl EstimateCost for Mistral {
    fn db_provider_name(&self) -> &str {
        "mistral"
    }
}
