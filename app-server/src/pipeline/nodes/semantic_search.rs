use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::utils::map_handles;
use super::NodeInput;
use super::{
    semantic_search_utils::{query_datasources, render_query_res_point},
    Handle,
};
use crate::datasets::Dataset;
use crate::engine::{RunOutput, RunnableNode};
use crate::pipeline::context::Context;

static DEFAULT_SEPARATOR: &str = "\n";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticSearchNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    pub limit: u32,
    pub threshold: f32,
    pub template: String,
    #[serde[default]]
    datasets: Vec<Dataset>,
}

#[async_trait]
impl RunnableNode for SemanticSearchNode {
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
        "SemanticSearch".to_string()
    }

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        context: Arc<Context>,
    ) -> Result<RunOutput> {
        if self.datasets.is_empty() {
            return Err(anyhow::anyhow!("Semantic search datasets missing."));
        }

        let query: String = inputs.get("query").unwrap().clone().try_into()?;

        let collection_name = context.env.get("collection_name");
        if collection_name.is_none() {
            return Err(anyhow::anyhow!("If you are using semantic search in a public pipeine, fork it to private pipeline, add your private data, and search over it."));
        }
        let collection_name = collection_name.unwrap();

        // Points are returned from semantic search sorted by relevance
        let points = query_datasources(
            &self.datasets,
            context.semantic_search.clone(),
            query,
            collection_name.clone(),
            self.limit,
            self.threshold,
        )
        .await?;

        let templated_results: Vec<String> = points
            .iter()
            .enumerate()
            .map(|(index, point)| render_query_res_point(&self.template, point, index + 1))
            .collect();

        let res = templated_results.join(DEFAULT_SEPARATOR);

        return Ok(RunOutput::Success((res.into(), None)));
    }
}
