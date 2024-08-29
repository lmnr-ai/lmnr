use std::{collections::HashMap, sync::Arc};

use anyhow::{Ok, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use super::utils::map_handles;
use super::{ConditionedValue, Handle, NodeInput};
use crate::engine::{RunOutput, RunnableNode};
use crate::pipeline::context::Context;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticSwitchNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    pub routes: Vec<SemanticSwitchRoute>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SemanticSwitchRoute {
    pub name: String,
    pub examples: Vec<String>,
}

#[derive(Deserialize)]
pub struct CohereClassifcationResponse {
    pub classifications: Vec<CohereClassification>,
}

#[derive(Deserialize)]
pub struct CohereClassification {
    pub prediction: String,
    #[serde(rename = "confidence")]
    pub _confidence: f32,
}

#[async_trait]
impl RunnableNode for SemanticSwitchNode {
    fn handles_mapping(&self) -> Vec<(Uuid, Handle)> {
        map_handles(&self.inputs, &self.inputs_mappings)
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
        "SemanticSwitch".to_string()
    }

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        _context: Arc<Context>,
    ) -> Result<RunOutput> {
        let input: String = inputs.values().next().unwrap().clone().try_into()?;

        let examples = self
            .routes
            .iter()
            .map(|route| {
                route.examples.iter().map(|example| {
                    json!({
                        "text": example,
                        "label": route.name
                    })
                })
            })
            .flatten()
            .collect::<Vec<Value>>();

        let client = reqwest::Client::new();

        let cohere_api_key = std::env::var("COHERE_API_KEY").unwrap();

        let res = client
            .post("https://api.cohere.ai/v1/classify")
            .header("accept", "application/json")
            .header("content-type", "application/json")
            .bearer_auth(cohere_api_key)
            .json(&serde_json::json!({
                "inputs": [input],
                "examples": examples
            }))
            .send()
            .await
            .unwrap();

        if res.status() != 200 {
            let error_text = res.text().await.unwrap();
            log::error!("Failed to classify input: {}", error_text);
            return Err(anyhow::anyhow!("Failed to classify input: {}", error_text));
        }

        let json = res.json::<CohereClassifcationResponse>().await.unwrap();

        let classification = json.classifications.first().unwrap();

        let condition_value = ConditionedValue {
            value: Box::new(NodeInput::String(input)),
            condition: classification.prediction.to_owned(),
        };

        Ok(RunOutput::Success((condition_value.into(), None)))
    }
}
