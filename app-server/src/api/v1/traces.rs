use std::sync::Arc;

use actix_web::{HttpRequest, HttpResponse, post, web};
use bytes::Bytes;
use serde::{Deserialize, Serialize};

use crate::{
    auth::ProjectAuthContext,
    db::{DB, spans::Span},
    features::{Feature, is_feature_enabled},
    mq::MessageQueue,
    opentelemetry_proto::opentelemetry::proto::collector::trace::v1::ExportTraceServiceRequest,
    routes::types::ResponseResult,
    traces::{
        input_dedup::MessageDedup,
        tool_dedup::ToolDedup,
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
    /// TODO: remove this field
    #[serde(default)]
    pub pre_processed: bool,
    /// Pre-computed dedup verdict for an LLM span's input messages.
    /// Storage is project-scoped; trace-new tracking is trace-scoped to
    /// preserve the "first occurrence per trace" search semantic. The
    /// consumer treats this as authoritative — it does not re-hash or
    /// re-check Redis.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_dedup: Option<MessageDedup>,
    /// Pre-computed dedup verdict for an LLM span's output messages. Same
    /// shape as `input_dedup`. Cross-direction collapse: model output of
    /// span A and input of span B that share content emit one
    /// `shared_content` row.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_dedup: Option<MessageDedup>,
    /// Pre-computed dedup verdict for an LLM span's tool definitions.
    /// Single hash per span; storage project-scoped via the shared
    /// `shared_content` table.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_dedup: Option<ToolDedup>,
}

// /v1/traces
#[post("")]
pub async fn process_traces(
    req: HttpRequest,
    body: Bytes,
    ctx: ProjectAuthContext,
    cache: web::Data<crate::cache::Cache>,
    spans_message_queue: web::Data<Arc<MessageQueue>>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let db = db.into_inner();
    let cache = cache.into_inner();
    let request = match decode_export_trace_request(&req, body) {
        Ok(request) => request,
        Err(e) => {
            return Ok(HttpResponse::BadRequest()
                .body(format!("Failed to decode ExportTraceServiceRequest: {e}")));
        }
    };
    let spans_message_queue = spans_message_queue.as_ref().clone();

    if is_feature_enabled(Feature::UsageLimit) {
        let bytes_limit_exceeded = get_workspace_bytes_limit_exceeded(
            db.clone(),
            clickhouse.into_inner().as_ref().clone(),
            cache.clone(),
            ctx.project_id,
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
        ctx.project_id,
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

/// Dispatch on `Content-Type`: `application/json` is OTLP/HTTP+JSON, anything else
/// (including missing) falls through to OTLP/HTTP+protobuf — matches what every
/// existing SDK sends today.
fn decode_export_trace_request(
    req: &HttpRequest,
    body: Bytes,
) -> Result<ExportTraceServiceRequest, anyhow::Error> {
    let content_type = req
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if content_type.starts_with("application/json") {
        decode_export_trace_service_request(&body)
            .map_err(|e| anyhow::anyhow!("OTLP/JSON decode failed: {e}"))
    } else {
        ExportTraceServiceRequest::decode(body)
            .map_err(|e| anyhow::anyhow!("OTLP/protobuf decode failed: {e}"))
    }
}
