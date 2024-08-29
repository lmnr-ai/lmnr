use anyhow::Result;
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

use crate::{
    datasets::datapoints::Datapoint,
    db::{datapoints, evaluations, pipelines::pipeline_version, DB},
    pipeline::{
        nodes::NodeInput,
        runner::PipelineRunner,
        trace::RunTrace,
        Graph, RunType,
    },
};

const BATCH_SIZE: usize = 20;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationStats {
    pub average_score: Option<f64>,
    pub average_executor_time: Option<f64>,
    pub average_evaluator_time: Option<f64>,
    pub executor_tokens: Option<i64>,
    pub evaluator_tokens: Option<i64>,
    pub executor_cost: Option<f64>,
    pub evaluator_cost: Option<f64>,
}

#[derive(Debug, Clone)]
struct EvalState {
    data: Value,
    target: Value,
    status: String,
    score: Option<f64>,
    executor_output: Option<HashMap<String, NodeInput>>,
    executor_run_id: Option<Uuid>,
    evaluator_run_id: Option<Uuid>,
    // Any printable error which happens during either executor or evaluator run
    // Used for better display on the client side
    error: Option<EvalStateError>,
}

impl EvalState {
    fn new(dp: &Datapoint) -> Self {
        Self {
            data: dp.data.clone(),
            target: dp.target.clone(),
            status: String::from("Error"),
            score: None,
            executor_output: None,
            executor_run_id: None,
            evaluator_run_id: None,
            error: None,
        }
    }
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EvalStateError {
    pub error_type: String,
    pub error: Value,
    pub executor_input_node_names: Option<Vec<String>>,
    pub evaluator_input_node_names: Option<Vec<String>>,
}

async fn run_executor_batch(
    pipeline_runner: Arc<PipelineRunner>,
    executor_graph: Graph,
    executor_pipeline_version_id: Uuid,
    eval_states: &mut Vec<EvalState>,
    env: &HashMap<String, String>,
) {
    let executor_inputs = eval_states
        .iter()
        .map(|dp| {
            let values =
                serde_json::from_value::<HashMap<String, Value>>(dp.data.to_owned()).unwrap();
            values
                .into_iter()
                .map(|(node_name, value)| (node_name, value.into()))
                .collect()
        })
        .collect();

    let exec_results = pipeline_runner
        .batch_run(
            executor_graph.clone(),
            &executor_inputs,
            &env,
        )
        .await;

    for (eval_state, exec_result) in eval_states.iter_mut().zip(exec_results) {
        let run_id = exec_result.run_id;
        let run_result = exec_result.run_result;
        let graph_trace = RunTrace::from_runner_result(
            run_id,
            executor_pipeline_version_id,
            RunType::Evaluation,
            &run_result,
            HashMap::new(),
            None,
            None,
        );

        if let Some(trace) = graph_trace {
            let _ = pipeline_runner.send_trace(trace).await;
        }

        eval_state.executor_run_id = Some(run_id);
        eval_state.executor_output = run_result
            .as_ref()
            .map(|output| Some(output.clone().output_values()))
            .unwrap_or_default();

        if let Err(e) = run_result {
            eval_state.error = Some(EvalStateError {
                error_type: e.variant_name().to_string(),
                error: serde_json::to_value(e).unwrap(),
                executor_input_node_names: Some(
                    executor_graph.get_input_node_names().into_iter().collect(),
                ),
                evaluator_input_node_names: None,
            });
        }
    }
}

async fn run_evaluator_batch(
    pool: &PgPool,
    evaluation_id: Uuid,
    pipeline_runner: Arc<PipelineRunner>,
    evaluator_graph: Graph,
    evaluator_pipeline_version_id: Uuid,
    eval_states: &mut Vec<EvalState>,
    env: &HashMap<String, String>,
    has_executor: bool,
) {
    let evaluator_inputs = eval_states
        .iter()
        .filter_map(|dp| {
            if dp.error.is_some() {
                return None;
            }
            // start with data if executor is not present
            let mut values = if has_executor {
                HashMap::new()
            } else {
                serde_json::from_value::<HashMap<String, Value>>(dp.data.to_owned()).unwrap()
            };

            let target_values =
                serde_json::from_value::<HashMap<String, Value>>(dp.target.to_owned()).unwrap();

            // add target values giving priority to target values
            values.extend(target_values);

            let mut inputs = values
                .into_iter()
                .map(|(node_name, value)| (node_name, value.into()))
                .collect::<HashMap<_, _>>();

            // finally add executor output giving priority to output values
            if let Some(exec_outputs) = &dp.executor_output {
                inputs.extend(exec_outputs.clone());
            }
            Some(inputs)
        })
        .collect();

    let mut evaluator_results = pipeline_runner
        .batch_run(
            evaluator_graph.clone(),
            &evaluator_inputs,
            &env,
        )
        .await;

    for eval_state in eval_states.iter_mut() {
        if eval_state.error.is_some() {
            continue;
        }
        // the `unwrap` below relies on the fact that evaluator_inputs is filtered by not eval_state.error.is_some()
        // So, if there are N `eval_states`, and M of them failed, then the `evaluator_inputs` (and hence `evaluator_results`)
        // will have N - M elements.
        // TODO: come up with something more robust
        let eval_result = evaluator_results.pop_front().unwrap();
        let run_id = eval_result.run_id;
        let run_result = eval_result.run_result;
        let graph_trace = RunTrace::from_runner_result(
            run_id,
            evaluator_pipeline_version_id,
            RunType::Evaluation,
            &run_result,
            HashMap::new(),
            None,
            None,
        );

        if let Some(trace) = graph_trace {
            let _ = pipeline_runner.send_trace(trace).await;
        }

        eval_state.evaluator_run_id = Some(run_id);

        if let Err(e) = &run_result {
            eval_state.error = Some(EvalStateError {
                error_type: e.variant_name().to_string(),
                error: serde_json::to_value(e).unwrap(),
                executor_input_node_names: Some(
                    evaluator_graph.get_input_node_names().into_iter().collect(),
                ),
                evaluator_input_node_names: None,
            });
        }

        match run_result {
            Ok(evaluator_output) => {
                let outputs = evaluator_output.output_values();
                let score_output = outputs.values().next();
                if let Some(score_output) = score_output {
                    match &score_output {
                        NodeInput::String(score) => {
                            if let Ok(score) = score.parse::<f64>() {
                                eval_state.status = String::from("Success");
                                eval_state.score = Some(score);
                            }
                        }
                        NodeInput::Float(score) => {
                            eval_state.status = String::from("Success");
                            eval_state.score = Some(*score);
                        }
                        _ => {}
                    }
                }
            }
            Err(e) => {
                eval_state.error = Some(EvalStateError {
                    error_type: e.variant_name().to_string(),
                    error: serde_json::to_value(e).unwrap(),
                    executor_input_node_names: None,
                    evaluator_input_node_names: Some(
                        evaluator_graph.get_input_node_names().into_iter().collect(),
                    ),
                })
            }
        }
    }

    if !eval_states.is_empty() {
        let _ = evaluations::set_evaluation_results(
            pool,
            evaluation_id,
            &eval_states.iter().map(|dp| dp.status.to_owned()).collect(),
            &eval_states.iter().map(|dp| dp.score.to_owned()).collect(),
            &eval_states.iter().map(|dp| dp.data.to_owned()).collect(),
            &eval_states.iter().map(|dp| dp.target.to_owned()).collect(),
            &eval_states
                .iter()
                .map(|dp| dp.executor_output.to_owned())
                .collect(),
            &eval_states
                .iter()
                .map(|dp| dp.evaluator_run_id.to_owned())
                .collect(),
            &eval_states
                .iter()
                .map(|dp| dp.executor_run_id.to_owned())
                .collect(),
            &eval_states
                .iter()
                .map(|dp| dp.error.as_ref().map(|e| serde_json::to_value(e).unwrap()))
                .collect(),
        )
        .await;
    }
}

async fn run_evaluation_batch(
    pool: &PgPool,
    pipeline_runner: Arc<PipelineRunner>,
    evaluation_id: Uuid,
    evaluator_graph: Graph,
    evaluator_pipeline_version_id: Uuid,
    executor_graph: Option<Graph>,
    executor_pipeline_version_id: Option<Uuid>,
    datapoints: Vec<Datapoint>,
    env: &HashMap<String, String>,
) {
    let mut eval_states = datapoints.iter().map(EvalState::new).collect::<Vec<_>>();
    let has_executor = executor_graph.is_some();
    if let Some(executor_graph) = executor_graph {
        run_executor_batch(
            pipeline_runner.clone(),
            executor_graph,
            executor_pipeline_version_id.unwrap(),
            &mut eval_states,
            env,
        )
        .await;
    }

    run_evaluator_batch(
        pool,
        evaluation_id,
        pipeline_runner,
        evaluator_graph,
        evaluator_pipeline_version_id,
        &mut eval_states,
        env,
        has_executor,
    )
    .await;
}

/// Run evaluation in batches
pub async fn run_evaluation(
    db: Arc<DB>,
    pipeline_runner: Arc<PipelineRunner>,
    evaluation_id: Uuid,
    dataset_id: Uuid,
    evaluator_pipeline_version_id: Uuid,
    executor_pipeline_version_id: Option<Uuid>,
    env: HashMap<String, String>,
) -> Result<()> {
    let pool = &db.pool;

    let evaluator_runnable_graph =
        pipeline_version::get_pipeline_version(pool, &evaluator_pipeline_version_id)
            .await
            .unwrap()
            .runnable_graph;
    let evaluator_graph = serde_json::from_value::<Graph>(evaluator_runnable_graph)?;

    let executor_graph: Option<Graph> =
        if let Some(executor_pipeline_version_id) = executor_pipeline_version_id {
            let executor_runnable_graph =
                pipeline_version::get_pipeline_version(pool, &executor_pipeline_version_id)
                    .await
                    .unwrap()
                    .runnable_graph;
            let executor_graph = serde_json::from_value::<Graph>(executor_runnable_graph)?;
            Some(executor_graph)
        } else {
            None
        };

    let mut offset = 0;

    loop {
        let datapoints =
            datapoints::get_datapoints_paginated(pool, dataset_id, BATCH_SIZE as i64, offset).await;
        if let Err(e) = datapoints {
            log::error!("Error getting datapoints: {:?}", e);
            let _ = evaluations::update_evaluation_status(&db.pool, evaluation_id, "Error").await;
            return Err(anyhow::anyhow!("Error getting datapoints"));
        }
        let datapoints = datapoints.unwrap();
        if datapoints.is_empty() {
            break;
        }

        // Execute batches sequentially (not in parallel), to avoid memory overloading
        run_evaluation_batch(
            pool,
            pipeline_runner.clone(),
            evaluation_id,
            evaluator_graph.clone(),
            evaluator_pipeline_version_id,
            executor_graph.clone(),
            executor_pipeline_version_id,
            datapoints,
            &env,
        )
        .await;

        offset += BATCH_SIZE as i64;
    }

    let _ = evaluations::update_evaluation_status(&db.pool, evaluation_id, "Finished").await;

    Ok(())
}
