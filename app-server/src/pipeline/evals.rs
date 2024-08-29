use std::{
    collections::{HashMap, VecDeque},
    sync::Arc,
};

use anyhow::Result;
use tokio::sync::Semaphore;
use uuid::Uuid;

use crate::engine::engine::EngineOutput;

use super::{
    nodes::NodeInput,
    runner::{PipelineRunner, PipelineRunnerError},
    Graph, RunType,
};

pub struct EvaluationPipelineRun {
    pub run_id: Uuid,
    pub run_result: Result<EngineOutput, PipelineRunnerError>,
}

impl PipelineRunner {
    pub async fn batch_run(
        &self,
        graph: Graph,
        datapoint_inputs: &Vec<HashMap<String, NodeInput>>,
        env: &HashMap<String, String>,
    ) -> VecDeque<EvaluationPipelineRun> {
        // attempt for bounded concurrency
        // ref: https://medium.com/@jaderd/you-should-never-do-bounded-concurrency-like-this-in-rust-851971728cfb

        // we limit the number of concurrent calls to avoid hitting the rate limit on the language model
        let permits = Arc::new(Semaphore::new(50));

        let run_calls = datapoint_inputs.iter().map(|inputs| {
            let permits = permits.clone();
            let mut graph = graph.clone();
            let run_id = Uuid::new_v4();
            async move {
                let _permit = permits.acquire().await.unwrap();
                if let Err(e) = graph.setup(&inputs, env, &HashMap::new(), &RunType::Evaluation) {
                    let run_result = Err(e.into());
                    EvaluationPipelineRun { run_id, run_result }
                } else {
                    let run_result = self.run(graph, None).await;
                    EvaluationPipelineRun { run_id, run_result }
                }
            }
        });

        futures::future::join_all(run_calls).await.into()
    }
}
