use std::sync::Arc;

use actix_web::{HttpRequest, HttpResponse, post, web};
use bytes::Bytes;
use serde::{Deserialize, Serialize};

use crate::{
    db::{DB, project_api_keys::ProjectApiKey, spans::Span},
    features::{Feature, is_feature_enabled},
    mq::MessageQueue,
    opentelemetry_proto::opentelemetry::proto::collector::trace::v1::ExportTraceServiceRequest,
    routes::types::ResponseResult,
    traces::{
        input_dedup::LlmInputDedup,
        {opentelemetry_json::decode_export_trace_service_request, producer::push_spans_to_queue},
    },
    utils::limits::get_workspace_bytes_limit_exceeded,
};
use prost::Message;

#[derive(Serialize, Deserialize, Clone)]
pub struct RabbitMqSpanMessage {
    pub span: Span,
    /// Producer-side preprocessing applied: `parse_and_enrich_attributes` +
    /// `convert_span_to_provider_format` already ran. Consumer skips them.
    /// Older agents emit messages without this field; default `false` keeps
    /// the legacy on-consumer pipeline working unchanged.
    #[serde(default)]
    pub pre_processed: bool,
    /// Pre-computed dedup verdict for an LLM span's input messages. Producer
    /// hashes each message and consults Redis: messages already seen in this
    /// `(project_id, trace_id)` are stripped from `span.input` and ride the
    /// queue as hash references only. The consumer treats this as
    /// authoritative — it does not re-hash or re-check Redis.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_dedup: Option<LlmInputDedup>,
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
    let request = match decode_export_trace_request(&req, body) {
        Ok(request) => request,
        Err(DecodeError::Json(e)) => {
            return Ok(HttpResponse::BadRequest()
                .body(format!("Failed to decode OTLP/JSON ExportTraceServiceRequest: {e}")));
        }
        Err(DecodeError::Proto(e)) => return Err(e.into()),
    };
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

/// Caller-actionable JSON decode failures vs. internal protobuf decode failures.
/// Kept separate so the handler can return 400 for the former without growing
/// the shared `routes::error::Error` enum.
enum DecodeError {
    Json(crate::traces::opentelemetry_json::JsonDecodeError),
    Proto(anyhow::Error),
}

/// Dispatch on `Content-Type`: `application/json` is OTLP/HTTP+JSON, anything else
/// (including missing) falls through to OTLP/HTTP+protobuf — matches what every
/// existing SDK sends today.
fn decode_export_trace_request(
    req: &HttpRequest,
    body: Bytes,
) -> Result<ExportTraceServiceRequest, DecodeError> {
    let content_type = req
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if content_type.starts_with("application/json") {
        decode_export_trace_service_request(&body).map_err(DecodeError::Json)
    } else {
        ExportTraceServiceRequest::decode(body).map_err(|e| {
            DecodeError::Proto(anyhow::anyhow!(
                "Failed to decode ExportTraceServiceRequest from bytes. {e}"
            ))
        })
    }
}
