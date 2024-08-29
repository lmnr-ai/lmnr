use std::{collections::HashMap, sync::Arc};

use actix_web::{get, post, web, HttpResponse};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    api::utils::{query_project_run_count_exceeded, query_target_pipeline_version},
    cache::Cache,
    db::{api_keys::ProjectApiKey, workspace::WorkspaceError, DB},
    pipeline::{
        nodes::{GraphOutput, GraphRunOutput, NodeInput, RunEndpointEventError, StreamChunk},
        runner::{PipelineRunner, PipelineRunnerError},
        trace::RunTrace,
        Graph, RunType,
    },
    routes::{
        error::{self, pipeline_runner_to_http_error},
        types::ResponseResult,
    },
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurrentTraceAndSpan {
    trace_id: Uuid,
    #[serde(default)]
    parent_span_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphRequest {
    /// Name of the pipeline to run
    pipeline: String,
    inputs: HashMap<String, NodeInput>,
    /// If None, new trace will be generated
    #[serde(default)]
    #[serde(flatten)]
    current_trace_and_span: Option<CurrentTraceAndSpan>,
    env: HashMap<String, String>,
    #[serde(default)]
    metadata: HashMap<String, String>,
    #[serde(default)]
    stream: bool,
}

#[post("pipeline/run")]
async fn run_pipeline_graph(
    pipeline_runner: web::Data<Arc<PipelineRunner>>,
    params: web::Json<GraphRequest>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let req = params.into_inner();
    let db = db.into_inner();
    let cache = cache.into_inner();
    let project_id = project_api_key.project_id;
    let inputs = req.inputs;
    let mut env = req.env;
    let metadata = req.metadata;
    let parent_span_id = req
        .current_trace_and_span
        .as_ref()
        .and_then(|t| t.parent_span_id);
    let trace_id = req.current_trace_and_span.map(|t| t.trace_id);
    env.insert("collection_name".to_string(), project_id.to_string());

    let exceeded = query_project_run_count_exceeded(db.clone(), cache.clone(), &project_id).await?;

    if exceeded.exceeded {
        return Err(error::workspace_error_to_http_error(
            WorkspaceError::RunLimitReached,
        ));
    }

    let pipeline_version =
        query_target_pipeline_version(db.clone(), cache.clone(), project_id, req.pipeline).await?;
    let pipeline_version_id = pipeline_version.id;

    let run_id = Uuid::new_v4(); // used to uniquely identify the related log or run trace
    let run_type = RunType::Endpoint;
    let mut graph = serde_json::from_value::<Graph>(pipeline_version.runnable_graph)
        .map_err(|e| error::Error::deserialization_error(Some(e)))?;
    graph
        .setup(&inputs, &env, &metadata, &run_type)
        .map_err(error::graph_error_to_http_error)?;

    if req.stream {
        let stream = async_stream::stream! {

            let (tx, mut rx) = tokio::sync::mpsc::channel::<StreamChunk>(8);

            tokio::spawn(async move {
                let run_result = pipeline_runner.run(graph, Some(tx.clone())).await;
                // write the trace
                let graph_trace = RunTrace::from_runner_result(
                    run_id,
                    pipeline_version_id,
                    run_type,
                    &run_result,
                    metadata,
                    parent_span_id,
                    trace_id,
                );

                if let Some(trace) = graph_trace {
                    let _ = pipeline_runner.send_trace(trace).await;
                }
                // communicate the end result to the client
                match run_result {
                    Ok(outputs) => {
                        let outputs = outputs
                            .output_values()
                            .into_iter()
                            .map(|(node_name, value)| {
                            (
                                node_name,
                                GraphOutput {
                                    value,
                                },
                            )
                            })
                            .collect();
                        let output_chunk = StreamChunk::GraphRunOutput(GraphRunOutput { outputs, run_id });

                        let _ = tx.send(output_chunk).await;
                    }
                    Err(error) => {
                        let run_id: Option<Uuid> = match error {
                            PipelineRunnerError::RunningError(_) => Some(run_id),
                            PipelineRunnerError::GraphError(_)
                            | PipelineRunnerError::DeserializationError(_)
                            | PipelineRunnerError::MissingEnvVarsError(_)
                            | PipelineRunnerError::TraceWritingError(_)
                            | PipelineRunnerError::UnhandledError(_)
                            | PipelineRunnerError::InvalidSchemasError(_) => None,
                        };
                        let chunk = StreamChunk::RunEndpointEventError(RunEndpointEventError {error, run_id});

                        let _ = tx.send(chunk).await;
                    }
                }
            });

            while let Some(chunk) = rx.recv().await {
                let formatted_event = format!("data: {}\n\n", serde_json::to_string(&chunk).unwrap());
                let bytes = formatted_event.into_bytes();

                yield Ok::<_, actix_web::Error>(bytes.into())
            }

        };

        Ok(HttpResponse::Ok()
            .content_type("text/event-stream")
            .streaming(stream))
    } else {
        let run_result = pipeline_runner.run(graph, None).await;

        let graph_trace = RunTrace::from_runner_result(
            run_id,
            pipeline_version_id,
            run_type,
            &run_result,
            metadata,
            parent_span_id,
            trace_id,
        );

        if let Some(trace) = graph_trace {
            let _ = pipeline_runner.send_trace(trace).await;
        }

        let run_result = run_result.map_err(|e| pipeline_runner_to_http_error(e, run_id))?;
        let outputs = run_result
            .output_values()
            .into_iter()
            .map(|(node_name, value)| (node_name, GraphOutput { value }))
            .collect();
        let res = GraphRunOutput { outputs, run_id };

        Ok(HttpResponse::Ok().json(res))
    }
}

#[get("healthcheck")]
async fn ping_healthcheck() -> ResponseResult {
    Ok(HttpResponse::Ok().finish())
}
