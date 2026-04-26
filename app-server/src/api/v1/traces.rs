use std::sync::Arc;

use actix_web::{HttpRequest, HttpResponse, delete, post, web};
use bytes::Bytes;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::{DB, project_api_keys::ProjectApiKey, spans::Span},
    features::{Feature, is_feature_enabled},
    mq::MessageQueue,
    opentelemetry_proto::opentelemetry::proto::collector::trace::v1::ExportTraceServiceRequest,
    routes::types::ResponseResult,
    traces::producer::push_spans_to_queue,
    utils::limits::get_workspace_bytes_limit_exceeded,
};
use prost::Message;

#[derive(Serialize, Deserialize, Clone)]
pub struct RabbitMqSpanMessage {
    pub span: Span,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteTracesRequest {
    pub trace_ids: Vec<Uuid>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteTracesResponse {
    pub deleted_traces: usize,
}

async fn delete_clickhouse_trace_rows(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    trace_ids: &[Uuid],
) -> anyhow::Result<()> {
    clickhouse
        .query(
            "
            DELETE FROM events_to_clusters
            WHERE project_id = {project_id: UUID}
              AND event_id IN (
                SELECT id
                FROM signal_events
                WHERE project_id = {project_id: UUID}
                  AND trace_id IN {trace_ids: Array(UUID)}
              )
            ",
        )
        .param("project_id", project_id)
        .param("trace_ids", trace_ids.to_vec())
        .with_option("mutations_sync", "1")
        .execute()
        .await?;

    clickhouse
        .query(
            "
            DELETE FROM signal_run_messages
            WHERE project_id = {project_id: UUID}
              AND run_id IN (
                SELECT run_id
                FROM signal_runs FINAL
                WHERE project_id = {project_id: UUID}
                  AND trace_id IN {trace_ids: Array(UUID)}
              )
            ",
        )
        .param("project_id", project_id)
        .param("trace_ids", trace_ids.to_vec())
        .with_option("mutations_sync", "1")
        .execute()
        .await?;

    const TRACE_DELETE_TABLES: &[(&str, &str)] = &[
        ("spans", "trace_id"),
        ("traces_replacing", "id"),
        ("trace_tags", "trace_id"),
        ("trace_summaries", "trace_id"),
        ("browser_session_events", "trace_id"),
        ("events", "trace_id"),
        ("logs", "trace_id"),
        ("signal_runs", "trace_id"),
        ("signal_events", "trace_id"),
    ];

    for (table, column) in TRACE_DELETE_TABLES {
        let query = format!(
            "
            DELETE FROM {table}
            WHERE project_id = {{project_id: UUID}}
              AND {column} IN {{trace_ids: Array(UUID)}}
            "
        );

        clickhouse
            .query(&query)
            .param("project_id", project_id)
            .param("trace_ids", trace_ids.to_vec())
            .with_option("mutations_sync", "1")
            .execute()
            .await?;
    }

    Ok(())
}

async fn delete_postgres_trace_rows(
    db: &DB,
    project_id: Uuid,
    trace_ids: &[Uuid],
) -> anyhow::Result<u64> {
    let mut tx = db.pool.begin().await?;

    sqlx::query("DELETE FROM traces_agent_messages WHERE project_id = $1 AND trace_id = ANY($2)")
        .bind(project_id)
        .bind(trace_ids)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM traces_agent_chats WHERE project_id = $1 AND trace_id = ANY($2)")
        .bind(project_id)
        .bind(trace_ids)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM shared_traces WHERE project_id = $1 AND id = ANY($2)")
        .bind(project_id)
        .bind(trace_ids)
        .execute(&mut *tx)
        .await?;

    let deleted_traces = sqlx::query("DELETE FROM traces WHERE project_id = $1 AND id = ANY($2)")
        .bind(project_id)
        .bind(trace_ids)
        .execute(&mut *tx)
        .await?
        .rows_affected();

    tx.commit().await?;

    Ok(deleted_traces)
}

// /v1/traces
#[delete("")]
pub async fn delete_traces(
    req: web::Json<DeleteTracesRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let mut trace_ids = req.into_inner().trace_ids;
    trace_ids.sort_unstable();
    trace_ids.dedup();

    if project_api_key.is_ingest_only {
        log::warn!(
            "Ingest-only API key attempted to delete traces: project_id={}",
            project_api_key.project_id
        );
        return Ok(HttpResponse::Forbidden().json(serde_json::json!({
            "error": "This API key does not have permission to delete traces"
        })));
    }

    if trace_ids.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "traceIds must contain at least one trace id"
        })));
    }

    let project_id = project_api_key.project_id;
    let clickhouse = clickhouse.into_inner();
    let db = db.into_inner();

    let deleted_traces = delete_postgres_trace_rows(db.as_ref(), project_id, &trace_ids).await?;
    delete_clickhouse_trace_rows(clickhouse.as_ref(), project_id, &trace_ids).await?;

    Ok(HttpResponse::Ok().json(DeleteTracesResponse {
        deleted_traces: deleted_traces as usize,
    }))
}

// /v1/traces
#[post("")]
pub async fn process_traces(
    req: HttpRequest,
    body: Bytes,
    project_api_key: ProjectApiKey,
    cache: web::Data<crate::cache::Cache>,
    spans_message_queue: web::Data<Arc<MessageQueue>>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let db = db.into_inner();
    let cache = cache.into_inner();
    let request = ExportTraceServiceRequest::decode(body).map_err(|e| {
        anyhow::anyhow!("Failed to decode ExportTraceServiceRequest from bytes. {e}")
    })?;
    let spans_message_queue = spans_message_queue.as_ref().clone();

    if is_feature_enabled(Feature::UsageLimit) {
        let bytes_limit_exceeded = get_workspace_bytes_limit_exceeded(
            db.clone(),
            clickhouse.into_inner().as_ref().clone(),
            cache.clone(),
            project_api_key.project_id,
        )
        .await
        .map_err(|e| {
            log::error!("Failed to get workspace limits: {:?}", e);
        });

        if bytes_limit_exceeded.is_ok_and(|exceeded| exceeded) {
            return Ok(HttpResponse::Forbidden().json("Workspace data limit exceeded"));
        }
    }

    let response = push_spans_to_queue(
        request,
        project_api_key.project_id,
        spans_message_queue,
        db,
        cache,
    )
    .await?;
    if response.partial_success.is_some() {
        return Err(anyhow::anyhow!("There has been an error during trace processing.").into());
    }

    let keep_alive = req.headers().get("connection").map_or(false, |v| {
        v.to_str().unwrap_or_default().trim().to_lowercase() == "keep-alive"
    });
    if keep_alive {
        Ok(HttpResponse::Ok().keep_alive().finish())
    } else {
        Ok(HttpResponse::Ok().finish())
    }
}
