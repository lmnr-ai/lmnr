use std::sync::Arc;
use std::collections::HashMap;

use actix_web::{delete, get, post, web, HttpResponse};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use uuid::Uuid;

use super::ResponseResult;
use crate::api::utils::query_project_run_count_exceeded;
use crate::db::pipelines::pipeline_version::PipelineVersionInfo;
use crate::db::workspace::WorkspaceError;
use crate::pipeline::nodes::Message;
use crate::pipeline::trace::RunTrace;
use crate::pipeline::utils::{get_pipeline_version_cache_key, to_env_with_provided_env_vars};
use crate::{
    cache::Cache,
    db::{
        self,
        pipelines::{pipeline_version, write_pipeline, Pipeline, PipelineVersion},
        DB,
    },
    pipeline::{
        nodes::{NodeInput, StreamChunk},
        runner::PipelineRunner,
        templates::insert_node_ids_to_template,
        Graph, RunType,
    },
    routes::error::{self, graph_error_to_http_error},
};

const DEFAULT_NEW_PIPELINE_VERSION_ID_STRING: &str = "db6d1708-9836-42f2-a3ea-732ca7709039";
const DEFAULT_PIPELINE_VERSION_NAME: &str = "main";

#[derive(Serialize, Deserialize, Debug)]
pub enum GraphInterruptMessage {
    Cancel,
    Continue,
}

#[derive(Deserialize)]
#[serde(rename_all(deserialize = "camelCase"))]
struct GraphInterruptRequest {
    run_id: Uuid,
    interrupt_message: GraphInterruptMessage,
}

#[post("pipelines/interrupt/graph")]
async fn run_pipeline_interrupt_graph(
    interrupt_senders: web::Data<Arc<DashMap<Uuid, mpsc::Sender<GraphInterruptMessage>>>>,
    params: web::Json<GraphInterruptRequest>,
) -> ResponseResult {
    let params = params.into_inner();
    let run_id = params.run_id;
    let interrupt_message = params.interrupt_message;

    let interrupt_senders = interrupt_senders.get_ref();
    if let Some(sender) = interrupt_senders.get(&run_id) {
        let _ = sender.send(interrupt_message).await;
    }

    Ok(HttpResponse::Ok().finish())
}

#[derive(Deserialize)]
#[serde(rename_all(deserialize = "camelCase"))]
struct GraphRunRequest {
    run_id: Uuid,
    graph: Graph,
    inputs: HashMap<String, NodeInput>,
    env: HashMap<String, String>,
    pipeline_version_id: Uuid,
    prefilled_messages: Option<Vec<Message>>,
    breakpoint_task_ids: Option<Vec<Uuid>>,
    start_task_id: Option<Uuid>,
}

#[post("pipelines/run/graph")]
async fn run_pipeline_graph(
    project_id: web::Path<Uuid>,
    pipeline_runner: web::Data<Arc<PipelineRunner>>,
    params: web::Json<GraphRunRequest>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    interrupt_senders: web::Data<Arc<DashMap<Uuid, mpsc::Sender<GraphInterruptMessage>>>>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let params = params.into_inner();
    let mut graph = params.graph;
    let inputs = params.inputs;
    let pipeline_version_id = params.pipeline_version_id;
    let run_id = params.run_id;
    let run_type = RunType::Workshop;
    let cache = cache.into_inner();
    let db = db.into_inner();
    let prefilled_messages = params.prefilled_messages;
    let start_task_id = params.start_task_id;
    let breakpoint_task_ids = params.breakpoint_task_ids;

    let exceeded = query_project_run_count_exceeded(db.clone(), cache.clone(), &project_id).await?;

    if exceeded.exceeded {
        return Err(error::workspace_error_to_http_error(
            WorkspaceError::RunLimitReached,
        ));
    }

    let (interrupt_tx, interrupt_rx) = mpsc::channel::<GraphInterruptMessage>(1);
    interrupt_senders.insert(run_id, interrupt_tx);

    let mut env = params.env;
    env = to_env_with_provided_env_vars(&env, &graph); // Quick hack
    env.insert("collection_name".to_string(), project_id.to_string());

    graph
        .setup(&inputs, &env, &HashMap::new(), &run_type)
        .map_err(graph_error_to_http_error)?;

    let stream = async_stream::stream! {
        let (tx, mut rx) = mpsc::channel::<StreamChunk>(100);

        tokio::spawn(async move {

            let run_result = pipeline_runner.run_workshop(
                    graph,
                    Some(tx.clone()),
                    prefilled_messages,
                    start_task_id,
                    breakpoint_task_ids,
                    interrupt_rx,
                ).await;

            let graph_trace = RunTrace::from_runner_result(
                run_id,
                pipeline_version_id,
                run_type,
                &run_result,
                HashMap::new(),
                None,
                None,
            );


            // Both successful and failed runs have trace
            if let Some(trace) = graph_trace {
                let _ = pipeline_runner.send_trace(trace.clone()).await;
                let output_chunk = StreamChunk::RunTrace(trace);
                let _ = tx.send(output_chunk).await;
            } else if let Err(e) = run_result {
                let _ = tx.send(StreamChunk::Error(e)).await;
            } else {
                log::error!("Run result is ok, but no trace was created");
            }
        });

        while let Some(chunk) = rx.recv().await {
            let event_name = match chunk {
                StreamChunk::NodeChunk(_) => "NodeChunk",
                StreamChunk::NodeEnd(_) => "NodeEnd",
                StreamChunk::RunTrace(_) => "RunTrace",
                StreamChunk::Error(_) => "Error",
                StreamChunk::GraphRunOutput(_) | StreamChunk::RunEndpointEventError(_) => {
                    log::error!("Invalid chunk type in pipeline run stream");
                    continue;
                },
                StreamChunk::Breakpoint(_) => "Breakpoint",
            };

            let formatted_event = format!("id: 1\nevent: {}\ndata: {}\n\n", event_name, serde_json::to_string(&chunk).unwrap());
            let bytes = formatted_event.into_bytes();

            yield Ok::<_, actix_web::Error>(bytes.into())
        }

        let _ = interrupt_senders.remove(&run_id);
    };

    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(stream))
}

#[get("pipelines")]
async fn get_pipelines(project_id: web::Path<Uuid>, db: web::Data<DB>) -> ResponseResult {
    let pipelines =
        db::pipelines::get_pipelines_of_project(&db.into_inner().pool, &project_id.into_inner())
            .await?;

    Ok(HttpResponse::Ok().json(pipelines))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePipelineRequest {
    pub project_id: Uuid,
    pub name: String,
    pub visibility: String,
    #[serde(default)]
    pub template_id: Option<Uuid>,
}

#[post("pipelines")]
async fn create_pipeline(
    request: web::Json<CreatePipelineRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    let pipeline_id = Uuid::new_v4();

    let pipeline = write_pipeline(
        &db.pool,
        pipeline_id,
        request.project_id,
        &request.name,
        &request.visibility,
    )
    .await?;

    let pipeline_version_id = Uuid::new_v4();
    let pipeline_type = "WORKSHOP";
    let pipeline_version_name = DEFAULT_PIPELINE_VERSION_NAME;
    let template_id = request
        .template_id
        .unwrap_or(Uuid::parse_str(DEFAULT_NEW_PIPELINE_VERSION_ID_STRING).unwrap());
    let template = db::pipelines::pipeline_templates::get_template(&db.pool, &template_id).await?;
    let template = insert_node_ids_to_template(&template);

    db::pipelines::pipeline_version::create_pipeline_version(
        &db.pool,
        pipeline_version_id,
        pipeline_id,
        pipeline_type,
        pipeline_version_name,
        &template.displayable_graph,
        &template.runnable_graph,
    )
    .await?;

    Ok(HttpResponse::Ok().json(pipeline))
}

#[get("{pipeline_id}")]
async fn get_public_pipeline_by_id(params: web::Path<Uuid>, db: web::Data<DB>) -> ResponseResult {
    let pipeline_id = params.into_inner();

    let pipeline = db::pipelines::get_pipeline_by_id(&db.pool, &pipeline_id).await?;

    if pipeline.visibility != "PUBLIC" {
        return Err(error::Error::invalid_request(Some(
            "Only public pipelines are accessible",
        )));
    }

    Ok(HttpResponse::Ok().json(pipeline))
}

#[get("pipelines/{pipeline_id}")]
async fn get_pipeline_by_id(params: web::Path<(Uuid, Uuid)>, db: web::Data<DB>) -> ResponseResult {
    let (_project_id, pipeline_id) = params.into_inner();

    let pipeline = db::pipelines::get_pipeline_by_id(&db.pool, &pipeline_id).await?;

    Ok(HttpResponse::Ok().json(pipeline))
}

/// Update pipeline name or visibility (public/private) or both.
#[post("pipelines/{pipeline_id}")]
async fn update_pipeline(
    params: web::Path<(Uuid, Uuid)>,
    db: web::Data<DB>,
    req: web::Json<Pipeline>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let (project_id, pipeline_id) = params.into_inner();

    let mut pipeline = req.into_inner();
    pipeline.id = Some(pipeline_id);
    pipeline.project_id = project_id;

    let old_pipeline = db::pipelines::pipeline::get_pipeline_by_id(&db.pool, &pipeline_id).await?;
    let cache_key = get_pipeline_version_cache_key(&project_id.to_string(), &old_pipeline.name);
    let _ = cache.remove::<PipelineVersion>(&cache_key).await;

    // TODO: Don't allow to make pipelines public if they don't contain commits
    let updated_pipeline = db::pipelines::update_pipeline(&db.pool, &pipeline).await?;

    Ok(HttpResponse::Ok().json(updated_pipeline))
}

#[delete("pipelines/{pipeline_id}")]
async fn delete_pipeline(params: web::Path<(Uuid, Uuid)>, db: web::Data<DB>) -> ResponseResult {
    let (_project_id, pipeline_id) = params.into_inner();

    db::pipelines::delete_pipeline(&db.pool, &pipeline_id).await?;

    Ok(HttpResponse::Ok().finish())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateTargetPipelineVersionRequest {
    pipeline_version_id: Uuid,
}

/// Create or update target pipeline version for a pipeline
#[post("pipelines/{pipeline_id}/target")]
async fn update_target_pipeline_version(
    params: web::Path<(Uuid, Uuid)>,
    req: web::Json<UpdateTargetPipelineVersionRequest>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let req = req.into_inner();
    let (project_id, pipeline_id) = params.into_inner();
    let pipeline_version_id = req.pipeline_version_id;

    let pipeline_version =
        db::pipelines::pipeline_version::get_pipeline_version_with_pipeline_name(
            &db.pool,
            &pipeline_version_id,
        )
        .await?;
    if pipeline_version.pipeline_type != "COMMIT" {
        return Err(error::Error::invalid_request(Some(
            "Only COMMIT pipeline versions can be set as target",
        )));
    }

    let target_pipeline_version =
        db::pipelines::pipeline_version::create_or_update_target_pipeline_version(
            &db.pool,
            pipeline_id,
            pipeline_version_id,
        )
        .await?;

    let cache_key = get_pipeline_version_cache_key(
        &project_id.to_string(),
        &pipeline_version.pipeline_name,
    );
    let _ = cache.remove::<PipelineVersion>(&cache_key).await;

    Ok(HttpResponse::Ok().json(target_pipeline_version))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePipelineVersionRequest {
    /// A workshop pipeline version id to clone this version from
    ref_version_id: Uuid,
    new_pipeline_name: String, // TODO: Rename to new_pipeline_version_name
    new_pipeline_type: String, // TODO: Rename to new_pipeline_version_type
}

/// Clones a pipeline version from a reference pipeline version
#[post("pipelines/{pipeline_id}/versions")]
async fn create_pipeline_version(
    req: web::Json<CreatePipelineVersionRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    let req = req.into_inner();
    let ref_pipeline_version_id = req.ref_version_id;
    let new_pipeline_name = req.new_pipeline_name;
    let new_pipeline_type = req.new_pipeline_type;

    // for now we don't allow branching, i.e. WORKSHOP versions cannot be created
    if new_pipeline_type != "COMMIT" {
        return Err(error::Error::invalid_request(Some(
            "Only COMMIT pipeline versions can be created",
        )));
    }

    db::pipelines::pipeline_version::clone_pipeline_version(
        &db.pool,
        ref_pipeline_version_id,
        &new_pipeline_name,
        &new_pipeline_type,
    )
    .await?;

    Ok(HttpResponse::Ok().finish())
}

#[get("pipelines/{pipeline_id}/versions")]
async fn get_pipeline_versions(
    db: web::Data<DB>,
    params: web::Path<(Uuid, Uuid)>,
) -> ResponseResult {
    let (_, pipeline_id) = params.into_inner();

    let versions = db::pipelines::get_pipeline_versions(&db.pool, &pipeline_id).await?;
    Ok(HttpResponse::Ok().json(versions))
}

#[get("versions-info")]
async fn get_public_pipeline_versions_info(
    db: web::Data<DB>,
    params: web::Path<Uuid>,
) -> ResponseResult {
    let pipeline_id = params.into_inner();

    // Only show committed and immutable pipeline versions publicly
    let versions = db::pipelines::get_commit_pipeline_versions_info(&db.pool, &pipeline_id).await?;
    Ok(HttpResponse::Ok().json(versions))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PipelineVersionsInfoResponse {
    pub commit_versions: Vec<PipelineVersionInfo>,
    pub workshop_version: PipelineVersionInfo,
}

#[get("pipelines/{pipeline_id}/versions-info")]
async fn get_pipeline_versions_info(
    db: web::Data<DB>,
    params: web::Path<(Uuid, Uuid)>,
) -> ResponseResult {
    let (_, pipeline_id) = params.into_inner();

    let versions = db::pipelines::get_pipeline_versions_info(&db.pool, &pipeline_id).await?;

    // Return all COMMIT workshop versions and the latest WORKSHOP version
    // TODO: Make sure that DB contains only one workshop version per pipeline
    let workshop_version = versions
        .iter()
        .find(|version| version.pipeline_type == "WORKSHOP")
        .cloned()
        .ok_or(anyhow::anyhow!("No workshop version found"))?;

    let commit_versions = versions
        .into_iter()
        .filter(|version| version.pipeline_type == "COMMIT")
        .collect::<Vec<_>>();

    Ok(HttpResponse::Ok().json(PipelineVersionsInfoResponse {
        commit_versions,
        workshop_version,
    }))
}

#[get("versions/{version_id}")]
async fn get_public_pipeline_version(
    db: web::Data<DB>,
    params: web::Path<(Uuid, Uuid)>,
) -> ResponseResult {
    let (_pipeline_id, version_id) = params.into_inner();
    let version = db::pipelines::get_pipeline_version(&db.pool, &version_id).await?;
    Ok(HttpResponse::Ok().json(version))
}

#[get("pipelines/{pipeline_id}/versions/{version_id}")]
async fn get_pipeline_version(
    db: web::Data<DB>,
    path: web::Path<(Uuid, Uuid, Uuid)>,
) -> ResponseResult {
    let (_project_id, _pipeline_id, version_id) = path.into_inner();
    let pipeline_version = pipeline_version::get_pipeline_version(&db.pool, &version_id).await?;
    Ok(HttpResponse::Ok().json(pipeline_version))
}

#[get("pipeline-versions/{version_id}")]
async fn get_version(db: web::Data<DB>, path: web::Path<(Uuid, Uuid)>) -> ResponseResult {
    let (_project_id, version_id) = path.into_inner();
    let pipeline_version = pipeline_version::get_pipeline_version(&db.pool, &version_id).await?;
    Ok(HttpResponse::Ok().json(pipeline_version))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ForkPipelineVersionRequest {
    /// Pipeline version id to be forked from some project and pipeline
    ref_version_id: Uuid,
    /// Name of the pipeline (not pipeline version) to be created inside the project
    new_pipeline_name: String,
}

/// Forks a pipeline version from a referenced pipeline version
///
/// Creates a new pipeline with passed pipeline name and clones referenced version
/// to a new workshop (editable) version.
///
/// The cloned version can be either a workshop or a commit version.
#[post("pipeline-versions")]
async fn fork_pipeline_version(
    req: web::Json<ForkPipelineVersionRequest>,
    db: web::Data<DB>,
    path: web::Path<Uuid>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let req = req.into_inner();

    let ref_pipeline_version_id = req.ref_version_id;

    let ref_pipeline =
        db::pipelines::get_pipeline_by_version_id(&db.pool, &ref_pipeline_version_id).await?;
    if ref_pipeline.project_id != project_id && ref_pipeline.visibility != "PUBLIC" {
        return Err(error::Error::invalid_request(Some(
            "Only public pipelines or pipelines within the same project can be forked",
        )));
    }

    let new_pipeline_name = req.new_pipeline_name;

    let new_pipeline_id = Uuid::new_v4();
    let new_pipeline_visibility = String::from("PRIVATE");
    write_pipeline(
        &db.pool,
        new_pipeline_id,
        project_id,
        &new_pipeline_name,
        &new_pipeline_visibility,
    )
    .await?;

    // TODO: We must check all the datasources and delete them from semantic search nodes
    let new_pipeline_version = db::pipelines::pipeline_version::clone_pipeline_version_to_pipeline(
        &db.pool,
        ref_pipeline_version_id,
        new_pipeline_id,
        DEFAULT_PIPELINE_VERSION_NAME,
        "WORKSHOP",
    )
    .await?;

    Ok(HttpResponse::Ok().json(new_pipeline_version))
}

#[post("pipelines/{pipeline_id}/versions/{version_id}")]
async fn update_pipeline_version(
    pipeline_version: web::Json<PipelineVersion>,
    db: web::Data<DB>,
) -> ResponseResult {
    let pipeline_version = pipeline_version.into_inner();
    if pipeline_version.pipeline_type != "WORKSHOP" {
        return Err(error::Error::invalid_request(Some(
            "only WORKSHOP pipeline can be updated",
        )));
    }

    db::pipelines::update_pipeline_version(&db.pool, &pipeline_version).await?;

    Ok(HttpResponse::Ok().json(pipeline_version))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverwritePipelineVersionRequest {
    ref_version_id: Uuid,
}

#[post("pipelines/{pipeline_id}/versions/{version_id}/overwrite")]
async fn overwrite_pipeline_version(
    req: web::Json<OverwritePipelineVersionRequest>,
    path: web::Path<(Uuid, Uuid, Uuid)>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (_, _, workshop_pipeline_version_id) = path.into_inner();
    let req = req.into_inner();
    let ref_pipeline_version_id = req.ref_version_id;

    db::pipelines::pipeline_version::overwrite_graph(
        &db.pool,
        ref_pipeline_version_id,
        workshop_pipeline_version_id,
    )
    .await?;

    Ok(HttpResponse::Ok().finish())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateTemplateRequest {
    name: String,
    description: String,
    runnable_graph: serde_json::Value,
    displayable_graph: serde_json::Value,
    #[serde(default)]
    group: Option<String>,
}

#[post("templates")]
async fn create_template(
    template: web::Json<CreateTemplateRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    let graph = serde_json::from_value::<Graph>(template.runnable_graph.clone())
        .map_err(|e| anyhow::anyhow!("could not parse graph {e}"))?;
    let number_of_nodes = graph.nodes.len() as i64;
    let mut runnable_graph = template.runnable_graph.clone().to_string();
    let mut displayable_graph = template.displayable_graph.clone().to_string();

    graph.nodes.values().enumerate().for_each(|(i, node)| {
        let node_id = node.id().to_string();
        let node_id_template = format!("<node_{}_id>", i);
        runnable_graph = runnable_graph.replace(&node_id, &node_id_template);
        displayable_graph = displayable_graph.replace(&node_id, &node_id_template);
    });

    let runnable_graph = serde_json::from_str(&runnable_graph).unwrap();
    let displayable_graph = serde_json::from_str(&displayable_graph).unwrap();

    let template = db::pipelines::pipeline_templates::write_template(
        &db.pool,
        &template.name,
        &template.description,
        &runnable_graph,
        &displayable_graph,
        number_of_nodes,
        &template.group.clone().unwrap_or("build".to_string()),
    )
    .await?;

    Ok(HttpResponse::Ok().json(template.id))
}

#[get("templates")]
async fn get_templates(db: web::Data<DB>) -> ResponseResult {
    let templates = db::pipelines::pipeline_templates::get_all_templates(&db.pool).await?;
    Ok(HttpResponse::Ok().json(templates))
}
