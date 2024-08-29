use std::{collections::HashMap, sync::Arc};

use crate::engine::{RunOutput, RunnableNode};
use crate::pipeline::{
    context::Context,
    trace::{MetaLog, RunTrace},
    Graph,
};
use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::prelude::FromRow;
use uuid::Uuid;

use super::utils::map_handles;
use super::{Handle, NodeInput};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubpipelineNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    // Names are for displaying these values in the frontend
    pub pipeline_name: String,
    #[serde(default)]
    pub pipeline_id: Option<Uuid>,
    pub pipeline_version_name: String,
    // Commit pipeline version id, must be immutable
    #[serde(default)]
    pub pipeline_version_id: Option<Uuid>,
    pub runnable_graph: Value,
}

#[derive(Debug, Clone, Serialize, FromRow, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubpipelineNodeMetaLog {
    pub outputs: Option<Value>, // None if some error occurred
    pub total_token_count: i64,
    pub approximate_cost: Option<f64>,
}

#[async_trait]
impl RunnableNode for SubpipelineNode {
    fn handles_mapping(&self) -> Vec<(Uuid, Handle)> {
        map_handles(&self.inputs, &self.inputs_mappings)
    }

    fn output_handle_id(&self) -> Uuid {
        // Sub graph must have only one output
        // This is a limitation of the current implementation
        // TODO: Update engine to support multiple outputs
        self.outputs.first().unwrap().id
    }

    fn node_name(&self) -> String {
        self.name.to_owned()
    }

    fn node_id(&self) -> Uuid {
        self.id
    }

    fn node_type(&self) -> String {
        "Subpipeline".to_string()
    }

    // TODO: Block infinite recursion (e.g. if depth is too high, return error)
    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        context: Arc<Context>,
    ) -> Result<RunOutput> {
        if self.pipeline_version_id.is_none() {
            return Err(anyhow::anyhow!("Pipeline version id is required"));
        }

        let run_id = Uuid::new_v4();
        let env = &context.env;

        let mut graph = serde_json::from_value::<Graph>(self.runnable_graph.clone())?;
        graph.setup(&inputs, &env, &context.metadata, &context.run_type)?;
        // TODO: Add streaming and websocket streaming here so that subpipelines can stream and use external functions.
        let run_result = context
            .pipeline_runner
            .run(graph, context.tx.clone())
            .await;

        let graph_trace = RunTrace::from_runner_result(
            run_id,
            self.pipeline_version_id.unwrap(),
            context.run_type.clone(),
            &run_result,
            context.metadata.clone(),
            None,
            None,
        );

        // Note that whether logs are recorded depend on the RunType
        if let Some(trace) = graph_trace.clone() {
            let _ = context.pipeline_runner.send_trace(trace).await;
        }

        match run_result {
            Ok(engine_output) => {
                let output_values = engine_output.output_values();
                let res = output_values.values().next().unwrap().clone();

                let meta_log = if let Some(trace) = graph_trace {
                    SubpipelineNodeMetaLog {
                        outputs: Some(serde_json::to_value(output_values).unwrap()),
                        total_token_count: trace.run_stats.total_token_count,
                        approximate_cost: trace.run_stats.approximate_cost,
                    }
                } else {
                    SubpipelineNodeMetaLog {
                        outputs: None,
                        total_token_count: 0,
                        approximate_cost: Some(0.0),
                    }
                };
                Ok(RunOutput::Success((
                    res,
                    Some(MetaLog::Subpipeline(meta_log)),
                )))
            }
            // TODO: Partial trace must be returned, modify engine's Err from anyhow to custom error type,
            // which will contain error type and optional meta_log/error trace fields
            Err(e) => Err(anyhow::anyhow!("Subpipeline run failed: {}", e)),
        }
    }
}
