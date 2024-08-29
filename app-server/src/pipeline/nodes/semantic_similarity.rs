use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

use crate::{
    engine::{RunOutput, RunnableNode},
    pipeline::context::Context,
};

use super::{utils::map_handles, Handle, NodeInput};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticSimilarityNode {
    pub id: Uuid,
    /// must match the name of the external function called
    pub name: String,
    pub inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    pub inputs_mappings: HashMap<Uuid, Uuid>,
}

#[async_trait]
impl RunnableNode for SemanticSimilarityNode {
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
        "SemanticSimilarity".to_string()
    }

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        context: Arc<Context>,
    ) -> Result<RunOutput> {
        let first: String = inputs.get("first").unwrap().clone().try_into()?;
        let second: String = inputs.get("second").unwrap().clone().try_into()?;

        let resp = context
            .semantic_search
            .calculate_similatity_scores(vec![first], vec![second])
            .await;

        match resp {
            Ok(response) => {
                let score = response.scores.get(0).unwrap().clone();
                Ok(RunOutput::Success((NodeInput::Float(score as f64), None)))
            }
            Err(e) => Err(anyhow::anyhow!("Failed to call semantic search {}", e)),
        }
    }
}
