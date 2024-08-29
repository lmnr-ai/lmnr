use std::collections::HashMap;

use json_value_merge::Merge;

use anyhow::Result;
use serde_json::{json, Value};
use tokio::sync::mpsc::Sender;

use crate::language_model::chat_message::{ChatCompletion, ChatMessage};

use crate::language_model::runner::ExecuteChatCompletion;
use crate::language_model::{LanguageModelProviderName, NodeInfo};
use crate::pipeline::nodes::StreamChunk;

pub const UNIFY: &str = "unify";

#[derive(Clone, Debug)]
pub struct Unify {
    client: reqwest::Client,
}

impl Unify {
    pub fn new(client: reqwest::Client) -> Self {
        Self { client }
    }
}

#[derive(Debug, serde::Deserialize)]
struct UnifyError {
    detail: String,
}

impl ExecuteChatCompletion for Unify {
    async fn chat_completion(
        &self,
        model: &str,
        provider_name: LanguageModelProviderName,
        messages: &Vec<ChatMessage>,
        params: &Value,
        env: &HashMap<String, String>,
        _tx: Option<Sender<StreamChunk>>,
        _node_info: &NodeInfo,
    ) -> Result<ChatCompletion> {
        let mut body = json!({
            "model": model,
            "messages": messages,
        });

        body.merge(params);

        let api_key = provider_name.api_key(env)?;

        let res = self
            .client
            .post("https://api.unify.ai/v0/chat/completions")
            .header("Content-Type", "application/json")
            .bearer_auth(api_key)
            .json(&body)
            .send()
            .await?;

        if res.status() != 200 {
            let res_body = res.json::<UnifyError>().await?;
            return Err(anyhow::anyhow!(res_body.detail));
        }

        let mut res_body = res.json::<ChatCompletion>().await?;
        res_body.usage.approximate_cost = self.estimate_cost(
            res_body.model().as_str(),
            res_body.usage.completion_tokens,
            res_body.usage.prompt_tokens,
        );

        Ok(res_body)
    }

    fn estimate_cost(
        &self,
        _model: &str,
        _completion_tokens: u32,
        _prompt_tokens: u32,
    ) -> Option<f64> {
        // TODO: Implement this considering the following:
        // 1. Parse the regex from the model name
        // 2. Model must come from the response, so that there is no "dynamic" providers in regex
        // 3. Account for routing price on top of model's price
        Some(0.0)
    }
}
