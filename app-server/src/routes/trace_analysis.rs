use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::{DB, semantic_event_definitions, trace_analysis_jobs},
    mq::MessageQueue,
    query_engine::QueryEngine,
    sql::{self, ClickhouseReadonlyClient},
    trace_analysis::{self, Task},
};

use super::{ResponseResult, error::Error};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitTraceAnalysisJobRequest {
    pub query: String,
    pub event_definition_id: Uuid,
    #[serde(default)]
    pub parameters: HashMap<String, serde_json::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitTraceAnalysisJobResponse {
    pub job_id: Uuid,
    pub total_traces: i32,
    pub event_definition_id: Uuid,
}

#[post("trace-analysis")]
pub async fn submit_trace_analysis_job(
    project_id: web::Path<Uuid>,
    request: web::Json<SubmitTraceAnalysisJobRequest>,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    queue: web::Data<Arc<MessageQueue>>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let SubmitTraceAnalysisJobRequest {
        query,
        parameters,
        event_definition_id,
    } = request.into_inner();

    let clickhouse_client = match clickhouse_ro.as_ref() {
        Some(client) => client.clone(),
        None => {
            return Err(Error::InternalAnyhowError(anyhow::anyhow!(
                "ClickHouse client is not configured"
            )));
        }
    };

    let event_definition = semantic_event_definitions::get_semantic_event_definition(
        &db.pool,
        event_definition_id,
        project_id,
    )
    .await
    .map_err(|e| {
        log::error!("Failed to query semantic event definition: {:?}", e);
        Error::InternalAnyhowError(anyhow::anyhow!("Failed to query semantic event definition"))
    })?;

    let event_definition = match event_definition {
        Some(def) => def,
        None => {
            return Err(Error::InternalAnyhowError(anyhow::anyhow!(
                "Semantic event definition not found"
            )));
        }
    };

    let results = sql::execute_sql_query(
        query,
        project_id,
        parameters,
        clickhouse_client,
        query_engine.into_inner().as_ref().clone(),
    )
    .await
    .map_err(|e| {
        log::error!("Failed to execute query for trace IDs: {:?}", e);
        Error::InternalAnyhowError(anyhow::anyhow!("Failed to execute query: {}", e))
    })?;

    // 4. Extract trace IDs from query results
    let trace_ids: Vec<String> = results
        .iter()
        .filter_map(|row| row.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();

    let total_traces = trace_ids.len() as i32;

    if total_traces == 0 {
        return Err(Error::InternalAnyhowError(anyhow::anyhow!(
            "No traces found matching the query"
        )));
    }

    let job = trace_analysis_jobs::create_trace_analysis_job(
        &db.pool,
        event_definition_id,
        project_id,
        total_traces,
    )
    .await
    .map_err(|e| {
        log::error!("Failed to create trace analysis job: {:?}", e);
        Error::InternalAnyhowError(anyhow::anyhow!("Failed to create trace analysis job"))
    })?;

    let tasks: Vec<Task> = trace_ids
        .iter()
        .map(|trace_id| Task {
            task_id: Uuid::new_v4(),
            trace_id: trace_id.parse::<Uuid>().unwrap(),
        })
        .collect();

    let message = trace_analysis::RabbitMqLLMBatchSubmissionMessage {
        project_id,
        job_id: job.id,
        event_definition_id,
        event_name: event_definition.name,
        prompt: event_definition.prompt,
        structured_output_schema: event_definition.structured_output_schema,
        model: "gemini-2.5-pro".to_string(),
        provider: "gemini".to_string(),
        tasks,
    };

    trace_analysis::push_to_submissions_queue(message, queue.as_ref().clone())
        .await
        .map_err(|e| {
            log::error!("Failed to push trace analysis to queue: {:?}", e);
            Error::InternalAnyhowError(anyhow::anyhow!("Failed to queue trace analysis job"))
        })?;

    let response = SubmitTraceAnalysisJobResponse {
        job_id: job.id,
        total_traces: job.total_traces,
        event_definition_id: job.event_definition_id,
    };

    Ok(HttpResponse::Ok().json(response))
}
