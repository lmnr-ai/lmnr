use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    ch::signal_runs::{CHSignalRun, insert_signal_runs},
    db::spans::SpanType,
    db::{DB, semantic_event_definitions, signal_jobs},
    mq::MessageQueue,
    query_engine::QueryEngine,
    signals::{self, RunStatus, SignalRunMessage, utils::emit_internal_span},
    sql::{self, ClickhouseReadonlyClient},
};

use super::{ResponseResult, error::Error};

const LLM_MODEL: &str = "gemini-2.5-pro";
const LLM_PROVIDER: &str = "gemini";

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
    clickhouse: web::Data<clickhouse::Client>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    queue: web::Data<Arc<MessageQueue>>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let SubmitTraceAnalysisJobRequest {
        query,
        parameters,
        event_definition_id: signal_id,
    } = request.into_inner();

    let clickhouse_client = match clickhouse_ro.as_ref() {
        Some(client) => client.clone(),
        None => {
            return Err(Error::InternalAnyhowError(anyhow::anyhow!(
                "ClickHouse client is not configured"
            )));
        }
    };

    let signal =
        semantic_event_definitions::get_semantic_event_definition(&db.pool, signal_id, project_id)
            .await
            .map_err(|e| {
                log::error!("Failed to query semantic event definition: {:?}", e);
                Error::InternalAnyhowError(anyhow::anyhow!(
                    "Failed to query semantic event definition"
                ))
            })?;

    let signal = match signal {
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

    // Extract trace IDs from query results
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

    let job = signal_jobs::create_signal_job(&db.pool, signal_id, project_id, total_traces)
        .await
        .map_err(|e| {
            log::error!("Failed to create trace analysis job: {:?}", e);
            Error::InternalAnyhowError(anyhow::anyhow!("Failed to create trace analysis job"))
        })?;

    let mut runs = Vec::with_capacity(trace_ids.len());
    for trace_id in &trace_ids {
        let run_id = Uuid::new_v4();
        let internal_trace_id = Uuid::new_v4();

        // Emit root span for internal tracing of a run
        let internal_span_id = emit_internal_span(
            "signal.run",
            internal_trace_id,
            job.id,
            run_id,
            &signal.name,
            None,
            SpanType::Default,
            chrono::Utc::now(),
            Some(serde_json::json!({
                "run_id": run_id,
                "trace_id": trace_id,
                "signal_id": signal_id,
                "job_id": job.id,
            })),
            None,
            None,
            None,
            Some(LLM_MODEL.to_string()),
            Some(LLM_PROVIDER.to_string()),
            queue.as_ref().clone(),
        )
        .await;

        runs.push(SignalRunMessage {
            run_id,
            trace_id: trace_id.parse::<Uuid>().unwrap(),
            internal_trace_id,
            internal_span_id,
            step: 0,
        });
    }

    // Insert runs into ClickHouse with pending status
    let now = chrono::Utc::now();
    let ch_runs: Vec<CHSignalRun> = runs
        .iter()
        .map(|r| {
            CHSignalRun::new(
                project_id,
                signal_id,
                job.id,
                r.run_id,
                now,
                RunStatus::Pending.to_string(),
                Uuid::nil(),
            )
        })
        .collect();

    insert_signal_runs(clickhouse.get_ref().clone(), &ch_runs)
        .await
        .map_err(|e| {
            log::error!("Failed to insert signal runs: {:?}", e);
            Error::InternalAnyhowError(anyhow::anyhow!("Failed to insert signal runs"))
        })?;

    // Push to submissions queue for processing
    let message = signals::SignalJobSubmissionBatchMessage {
        project_id,
        job_id: job.id,
        signal_id,
        signal_name: signal.name,
        prompt: signal.prompt,
        structured_output_schema: signal.structured_output_schema,
        model: LLM_MODEL.to_string(),
        provider: LLM_PROVIDER.to_string(),
        runs,
    };

    signals::push_to_submissions_queue(message, queue.as_ref().clone())
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
