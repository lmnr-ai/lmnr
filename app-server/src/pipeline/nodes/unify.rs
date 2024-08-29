use std::{collections::HashMap, sync::Arc};

use crate::engine::{RunOutput, RunnableNode};
use crate::language_model::NodeInfo;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::prelude::FromRow;
use tonic::async_trait;
use uuid::Uuid;

use crate::language_model::{providers::unify::UNIFY, ChatMessage};
use crate::pipeline::{context::Context, trace::MetaLog};

use super::NodeInput;
use super::{
    utils::{map_handles, render_template},
    Handle,
};

#[derive(Debug, Clone, Deserialize, Serialize)]
struct UnifyThreshold {
    float: f64,
    metric: String,
}

/// Node which calls Unify, which is a service that inferences various models
///
/// Model name has format: [<uploaded_by>/]<model_namse>@<provider_name>(<<float><metric>)*
/// provider_name can be substituted with one of configs: lowest-input-cost, lowest-output-cost, lowest-itl, lowest-ttft
/// Thresholds can be added by appending <[float][metric] to provider name
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifyNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    pub dynamic_inputs: Vec<Handle>,
    pub prompt: String,

    uploaded_by: String,
    model_name: String,
    provider_name: String,
    metrics: Vec<UnifyThreshold>,

    /// OpenAI compatible model params
    #[serde(default)]
    pub model_params: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifyNodeMetaLog {
    pub prompt: String,
    pub input_token_count: i64,
    pub output_token_count: i64,
    pub total_token_count: i64,
    pub approximate_cost: Option<f64>,
    pub request_model: String,
    pub response_model: String,
}

#[async_trait]
impl RunnableNode for UnifyNode {
    fn handles_mapping(&self) -> Vec<(Uuid, Handle)> {
        let combined_inputs = self
            .inputs
            .iter()
            .chain(self.dynamic_inputs.iter())
            .cloned()
            .collect();

        map_handles(&combined_inputs, &self.inputs_mappings)
    }

    fn output_handle_id(&self) -> Uuid {
        self.outputs.first().unwrap().id
    }

    fn node_name(&self) -> String {
        self.name.to_owned()
    }

    fn node_id(&self) -> Uuid {
        self.id
    }

    fn node_type(&self) -> String {
        "Unify".to_string()
    }

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        context: Arc<Context>,
    ) -> Result<RunOutput> {
        let input_chat_messages = match inputs.get("chat_messages") {
            Some(messages) => messages.clone().try_into()?,
            None => vec![],
        };

        let rendered_prompt = render_template(&self.prompt, &inputs);

        let mut messages = vec![ChatMessage {
            role: String::from("system"),
            content: rendered_prompt.clone(),
        }];
        messages.extend(input_chat_messages.as_slice().to_vec());

        let params = serde_json::from_str::<HashMap<String, Value>>(
            self.model_params
                .clone()
                .unwrap_or("{}".to_string())
                .as_str(),
        )
        .map_err(|e| anyhow::anyhow!("Failed to parse model params: {}", e))?;

        let params = serde_json::to_value(params).unwrap();
        let unify_model = format!(
            "{}:{}{}{}@{}{}",
            UNIFY,
            self.uploaded_by,
            (if !self.uploaded_by.is_empty() {
                "/"
            } else {
                ""
            }),
            self.model_name,
            self.provider_name,
            self.metrics
                .iter()
                .map(|m| format!("<{}{}", m.float, m.metric))
                .collect::<Vec<String>>()
                .join("")
        );

        let node_info = NodeInfo {
            id: Uuid::new_v4(),
            node_id: self.id,
            node_name: self.name.clone(),
            node_type: self.node_type(),
        };
        let completion = context
            .language_model
            .chat_completion(
                &unify_model,
                &messages,
                &params,
                &context.env,
                None,
                &node_info,
            )
            .await?;

        let response_message = completion.text_message();
        let usage = completion.usage();

        let meta_log = UnifyNodeMetaLog {
            prompt: rendered_prompt,
            input_token_count: usage.prompt_tokens as i64,
            output_token_count: usage.completion_tokens as i64,
            total_token_count: usage.total_tokens as i64,
            approximate_cost: usage.approximate_cost,
            request_model: unify_model,
            response_model: completion.model(),
        };

        Ok(RunOutput::Success((
            response_message.into(),
            Some(MetaLog::Unify(meta_log)),
        )))
    }
}
