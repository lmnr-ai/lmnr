use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::prelude::FromRow;
use tokio::sync::Semaphore;
use uuid::Uuid;

use crate::{
    engine::{engine::EngineOutput, RunOutput, RunnableNode},
    pipeline::{
        context::Context,
        runner::{PipelineRunner, PipelineRunnerError},
        trace::{MetaLog, RunTraceStats},
        Graph,
    },
};

use super::{utils::map_handles, Handle, NodeInput};

const BATCH_SIZE: usize = 50;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapNode {
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
pub struct MapNodeMetaLog {
    pub inputs_count: i64,
    pub outputs_count: i64,
    pub total_token_count: i64,
    pub approximate_cost: Option<f64>,
}

pub struct SubpipelineRunResult {
    pub run_result: Result<EngineOutput, PipelineRunnerError>,
    pub total_token_count: i64,
    pub approximate_cost: Option<f64>,
}

impl PipelineRunner {
    pub async fn batch_run_with_metadata(
        &self,
        graph: Graph,
        inputs_vec: &Vec<HashMap<String, NodeInput>>,
        context: Arc<Context>,
    ) -> Vec<SubpipelineRunResult> {
        // attempt for bounded concurrency
        // ref: https://medium.com/@jaderd/you-should-never-do-bounded-concurrency-like-this-in-rust-851971728cfb

        // we limit the number of concurrent calls to avoid hitting the rate limit on the language model
        let permits = Arc::new(Semaphore::new(50));

        let run_calls = inputs_vec.iter().map(|inputs| {
            let permits = permits.clone();

            let mut graph = graph.clone();
            let env = context.env.clone();
            let metadata = context.metadata.clone();
            let run_type = context.run_type.clone();

            async move {
                let _permit = permits.acquire().await.unwrap();
                let mut total_token_count = 0;
                let mut approximate_cost = Some(0.0);

                if let Err(e) = graph.setup(&inputs, &env, &metadata, &run_type.clone()) {
                    let run_result = Err(e.into());
                    SubpipelineRunResult {
                        run_result,
                        total_token_count,
                        approximate_cost,
                    }
                } else {
                    let run_result = self.run(graph, None).await;

                    let trace = PipelineRunner::get_trace_from_result(&run_result);

                    // TODO: record logs if needed

                    if let Some(trace) = trace {
                        let run_stats = RunTraceStats::from_messages(&trace.messages);
                        total_token_count = run_stats.total_token_count;
                        approximate_cost = run_stats.approximate_cost;
                    }

                    SubpipelineRunResult {
                        run_result,
                        total_token_count,
                        approximate_cost,
                    }
                }
            }
        });

        futures::future::join_all(run_calls).await.into()
    }
}

#[async_trait]
impl RunnableNode for MapNode {
    fn handles_mapping(&self) -> Vec<(Uuid, Handle)> {
        map_handles(&self.inputs, &self.inputs_mappings)
    }

    fn output_handle_id(&self) -> Uuid {
        // Sub graphs must take only one string input and produce one string output
        // So currently the input is list of strings and there is only one output which is a list of strings.
        self.outputs.first().unwrap().id
    }

    fn node_name(&self) -> String {
        self.name.to_owned()
    }

    fn node_id(&self) -> Uuid {
        self.id
    }

    fn node_type(&self) -> String {
        "Map".to_string()
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

        let graph = serde_json::from_value::<Graph>(self.runnable_graph.clone())?;
        let input_node_names = graph.get_input_node_names();
        let input_node_name = input_node_names.iter().next().unwrap();

        let inp = inputs.get("inputs").unwrap().clone();
        let input_list = match inp {
            NodeInput::StringList(input_list) => input_list,
            _ => return Err(anyhow::anyhow!("Input must be a list of strings")),
        };

        let mut outputs_list: Vec<String> = Vec::new();
        let mut total_token_count = 0;
        let mut approximate_cost = Some(0.0);

        for batch in input_list.chunks(BATCH_SIZE) {
            let inputs_vec = batch
                .iter()
                .map(|input| {
                    let mut inputs: HashMap<String, NodeInput> = HashMap::new();
                    inputs.insert(input_node_name.to_string(), input.clone().into());
                    inputs
                })
                .collect::<Vec<_>>();

            let run_results = context
                .pipeline_runner
                .batch_run_with_metadata(graph.clone(), &inputs_vec, context.clone())
                .await;

            for res in run_results {
                total_token_count += res.total_token_count;
                let message_cost = res.approximate_cost;
                if let Some(cost) = approximate_cost {
                    if let Some(message_cost) = message_cost {
                        approximate_cost = Some(cost + message_cost);
                    } else {
                        approximate_cost = None;
                    }
                }

                match res.run_result {
                    Ok(engine_output) => {
                        // Regardless of the output type of the subpipeline, "into" will convert its output to a string
                        let output = engine_output
                            .output_values()
                            .values()
                            .next()
                            .unwrap()
                            .clone()
                            .into();
                        outputs_list.push(output);
                    }
                    Err(e) => {
                        // Silently ignore for now
                        log::error!("Error running subpipeline in map node: {}", e);
                    }
                }
            }
        }

        let meta_log = MapNodeMetaLog {
            inputs_count: input_list.len() as i64,
            outputs_count: outputs_list.len() as i64,
            total_token_count,
            approximate_cost,
        };

        Ok(RunOutput::Success((
            outputs_list.into(),
            Some(MetaLog::Map(meta_log)),
        )))
    }
}
