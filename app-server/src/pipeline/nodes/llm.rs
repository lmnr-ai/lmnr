use std::{collections::HashMap, sync::Arc};

use crate::engine::{RunOutput, RunnableNode};
use crate::language_model::providers::utils::get_provider;
use crate::language_model::{ChatCompletion, ChatMessageContent, NodeInfo};
use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::prelude::FromRow;
use uuid::Uuid;

use crate::{
    language_model::ChatMessage,
    pipeline::{context::Context, trace::MetaLog},
};

use super::utils::map_handles;
use super::HandleType;
use super::{utils::render_template, Handle, NodeInput};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LLMNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    pub dynamic_inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    pub prompt: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub model_params: Option<String>,
    #[serde(default)]
    pub semantic_cache_enabled: bool,
    #[serde(default)]
    pub semantic_cache_dataset_id: Option<Uuid>,
    #[serde(default)]
    pub semantic_similarity_threshold: Option<f32>,
    #[serde(default)]
    pub semantic_cache_data_key: Option<String>,
    /// Controls streaming for endpoint runs. Workshop runs are always streaming.
    #[serde(default)]
    pub stream: bool,
    #[serde(flatten)]
    pub structured_output_params: StructuredOutputParams,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredOutputParams {
    #[serde(default)]
    pub structured_output_enabled: bool,
    /// number of times to retry on structured output failure
    #[serde(default)]
    pub structured_output_max_retries: u64,
    /// a BAML/jinja formatted template
    #[serde(default)]
    pub structured_output_schema: Option<String>,
    /// target class or enum name inside the schema.
    /// This is useful when we have nested classes in the schema.
    /// If not specified, the first class will be used.
    #[serde(default)]
    pub structured_output_schema_target: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LLMNodeMetaLog {
    pub prompt: String,
    #[serde(skip_serializing)]
    pub node_chunk_id: Option<Uuid>,
    pub input_message_count: i64,
    pub input_token_count: i64,
    pub output_token_count: i64,
    pub total_token_count: i64,
    pub model: String,
    #[serde(default)]
    pub approximate_cost: Option<f64>,
    pub provider: String,
}

#[async_trait]
impl RunnableNode for LLMNode {
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
        "LLM".to_string()
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

        let enable_structured_output = self.structured_output_params.structured_output_enabled
            && self
                .structured_output_params
                .structured_output_schema
                .is_some();

        let baml_context = context.baml_schemas.get(&self.id);

        let prompt = if enable_structured_output {
            format!(
                "{}\n\n{}",
                rendered_prompt,
                baml_context.unwrap().render_prompt()?
            )
        } else {
            rendered_prompt
        };

        let mut messages = vec![ChatMessage {
            role: String::from("system"),
            content: ChatMessageContent::Text(prompt.clone()),
        }];

        messages.extend(input_chat_messages.clone().into_iter());

        let params = serde_json::from_str::<HashMap<String, Value>>(
            self.model_params
                .clone()
                .unwrap_or("{}".to_string())
                .as_str(),
        )
        .map_err(|e| anyhow::anyhow!("Failed to parse model params: {}", e))?;

        let params = serde_json::to_value(params).unwrap();

        let env_vars = &context.env;

        let tx = if context.tx.is_some() && (self.stream || context.run_type.do_local_stream()) {
            Some(context.tx.clone().unwrap())
        } else {
            None
        };

        let node_chunk_id = Uuid::new_v4();
        let node_info = NodeInfo {
            id: node_chunk_id,
            node_id: self.id,
            node_name: self.name.clone(),
            node_type: self.node_type(),
        };

        let mut retry_counter = 0 as u64;
        let model = match (&self.model, inputs.get("model")) {
            (Some(model), _) => model.clone(),
            (_, Some(model)) => model.clone().into(),
            _ => return Err(anyhow::anyhow!("Model not found in LLM node {}", self.id)),
        };
        let provider_name = get_provider(&model).unwrap_or_default();
        loop {
            let completion = context
                .language_model
                .chat_completion(
                    &model.trim(),
                    &messages,
                    &params,
                    &env_vars,
                    tx.clone(),
                    &node_info,
                )
                .await?;
            let response_message = completion.text_message();
            let enable_chat_message_output =
                self.outputs.first().unwrap().handle_type == HandleType::ChatMessageList;

            if enable_structured_output {
                let structured_output = baml_context.unwrap().validate_result(&response_message);
                if let Ok(result) = structured_output {
                    return Ok(self.build_ok_result(
                        &completion,
                        result,
                        prompt,
                        &messages,
                        input_chat_messages,
                        enable_chat_message_output,
                        node_chunk_id,
                        provider_name,
                    ));
                } else if retry_counter
                    >= self.structured_output_params.structured_output_max_retries
                {
                    return Err(anyhow::anyhow!(
                        "Json schema validation failed after {} retries.\n\nLast attempt's output:\n{}.\n\nError:\n{}",
                        retry_counter,
                        response_message,
                        structured_output.as_ref().err().unwrap().to_string(),
                    ));
                }

                retry_counter += 1;
                messages.extend(vec![
                    ChatMessage {
                        role: String::from("assistant"),
                        content: ChatMessageContent::Text(response_message.clone()),
                    },
                    ChatMessage {
                        role: String::from("user"),
                        content: ChatMessageContent::Text(format!(
                            "Json schema validation failed with error: {}\n\nPlease retry",
                            structured_output.as_ref().err().unwrap().to_string(),
                        )),
                    },
                ]);
            } else {
                return Ok(self.build_ok_result(
                    &completion,
                    response_message,
                    prompt,
                    &messages,
                    input_chat_messages,
                    enable_chat_message_output,
                    node_chunk_id,
                    provider_name,
                ));
            }
        }
    }
}

impl LLMNode {
    fn build_ok_result(
        &self,
        completion: &ChatCompletion,
        // result of the completion, may be different from the completion message because BAML modifies it.
        result: String,
        prompt: String,
        messages: &Vec<ChatMessage>,
        input_messages: Vec<ChatMessage>,
        enable_chat_message_output: bool,
        node_chunk_id: Uuid,
        provider_name: &str,
    ) -> RunOutput {
        let usage = completion.usage();
        let input_message_count = messages
            .iter()
            .filter(|message| message.role != "system")
            .count() as i64;
        let meta_log = LLMNodeMetaLog {
            node_chunk_id: Some(node_chunk_id),
            model: completion.model(),
            prompt,
            input_message_count,
            input_token_count: usage.prompt_tokens as i64,
            output_token_count: usage.completion_tokens as i64,
            total_token_count: usage.total_tokens as i64,
            approximate_cost: usage.approximate_cost,
            provider: String::from(provider_name),
        };

        if enable_chat_message_output {
            let mut response_chat_messages = input_messages;
            response_chat_messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: ChatMessageContent::Text(result),
            });

            RunOutput::Success((response_chat_messages.into(), Some(MetaLog::LLM(meta_log))))
        } else {
            RunOutput::Success((result.into(), Some(MetaLog::LLM(meta_log))))
        }
    }
}
