use std::sync::Arc;

use actix_web::{HttpResponse, post, web};
use bytes::Bytes;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    db::{DB, project_api_keys::ProjectApiKey},
    features::{Feature, is_feature_enabled},
    mq::{MessageQueue, stream::StreamPublisher},
    routes::types::ResponseResult,
    traces::{
        atif::{
            convert::{self, ConvertOptions, ParentSpan},
            schema::Trajectory,
        },
        producer::SpanMessageBatch,
        rate_limit::{IngestionRateLimiter, IngestionTransport},
    },
    utils::limits::get_workspace_bytes_limit_exceeded,
};

/// The body is either a bare ATIF trajectory or this envelope, told apart by
/// the `trajectory` key.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IngestTrajectoryRequest {
    trajectory: Trajectory,
    #[serde(alias = "trace_id")]
    trace_id: Option<Uuid>,
    #[serde(alias = "parent_span_context")]
    parent_span_context: Option<ParentSpanContext>,
    #[serde(alias = "session_id")]
    session_id: Option<String>,
    #[serde(alias = "user_id")]
    user_id: Option<String>,
    metadata: Option<Map<String, Value>>,
}

/// An SDK span to nest the trajectory under, e.g. from
/// `Laminar.get_laminar_span_context()`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParentSpanContext {
    #[serde(alias = "trace_id")]
    trace_id: Uuid,
    #[serde(alias = "span_id")]
    span_id: Uuid,
    #[serde(default, alias = "span_path")]
    span_path: Vec<String>,
    #[serde(default, alias = "span_ids_path")]
    span_ids_path: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IngestTrajectoryResponse {
    trace_id: Uuid,
    span_count: usize,
}

// /v1/atif
#[post("")]
pub async fn ingest_trajectory(
    body: Bytes,
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
    spans_message_queue: web::Data<Arc<MessageQueue>>,
    spans_stream_publisher: web::Data<Option<Arc<StreamPublisher>>>,
    rate_limiter: web::Data<Option<Arc<IngestionRateLimiter>>>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let cache = cache.into_inner();

    // Shares the OTLP HTTP quota.
    if let Some(limiter) = rate_limiter.get_ref()
        && !limiter
            .check(&cache, project_id, IngestionTransport::Http)
            .await
    {
        return Ok(HttpResponse::TooManyRequests().finish());
    }

    let request = match parse_request(&body) {
        Ok(request) => request,
        Err(e) => {
            return Ok(HttpResponse::BadRequest().body(format!("Invalid ATIF trajectory: {e}")));
        }
    };
    drop(body);
    let spans_message_queue = spans_message_queue.as_ref().clone();

    if is_feature_enabled(Feature::UsageLimit) {
        let bytes_limit_exceeded = get_workspace_bytes_limit_exceeded(
            db.clone(),
            clickhouse.into_inner().as_ref().clone(),
            cache.clone(),
            spans_message_queue.clone(),
            project_id,
        )
        .await
        .map_err(|e| {
            log::error!("Failed to get workspace limits: {:?}", e);
        });

        if bytes_limit_exceeded.is_ok_and(|exceeded| exceeded) {
            return Ok(HttpResponse::Forbidden().json("Workspace data limit exceeded"));
        }
    }

    let options = convert_options(project_id, &request);
    let trace_id = options.trace_id;
    let converted = convert::convert_trajectory(&request.trajectory, &options);
    drop(request);
    let span_count = converted.span_count();
    if span_count == 0 {
        return Ok(HttpResponse::Ok().json(IngestTrajectoryResponse {
            trace_id,
            span_count,
        }));
    }

    // Every converted span is recorded, so siblings can share dedup claims —
    // without that each LLM span would ship the whole history again.
    let mut batch = SpanMessageBatch::across_spans(project_id);
    for span in converted.into_spans() {
        let message = RabbitMqSpanMessage {
            span,
            pre_processed: false,
            input_dedup: None,
            output_dedup: None,
            tool_dedup: None,
        };
        batch.push(message, &cache).await;
    }
    let rejected = batch
        .publish(
            spans_message_queue,
            db,
            cache,
            spans_stream_publisher.get_ref().clone(),
        )
        .await
        .map_err(|e| {
            log::error!("Failed to publish ATIF spans to queue: {:?}", e);
            anyhow::anyhow!("Failed to publish spans")
        })?;
    if rejected > 0 {
        return Ok(HttpResponse::PayloadTooLarge()
            .json("Trajectory too large: its converted spans exceed the queue payload limit"));
    }

    Ok(HttpResponse::Ok().json(IngestTrajectoryResponse {
        trace_id,
        span_count,
    }))
}

fn parse_request(body: &[u8]) -> serde_json::Result<IngestTrajectoryRequest> {
    let value: Value = serde_json::from_slice(body)?;
    if value.get("trajectory").is_some() {
        return serde_json::from_value(value);
    }
    Ok(IngestTrajectoryRequest {
        trajectory: serde_json::from_value(value)?,
        trace_id: None,
        parent_span_context: None,
        session_id: None,
        user_id: None,
        metadata: None,
    })
}

fn convert_options(project_id: Uuid, request: &IngestTrajectoryRequest) -> ConvertOptions {
    let parent = request.parent_span_context.as_ref();
    let trace_id = parent
        .map(|parent| parent.trace_id)
        .or(request.trace_id)
        .unwrap_or(Uuid::new_v4());
    ConvertOptions {
        project_id,
        trace_id,
        parent: parent.map(parent_span),
        session_id: request.session_id.clone(),
        user_id: request.user_id.clone(),
        metadata: request.metadata.clone().unwrap_or_default(),
        received_at: Utc::now(),
    }
}

/// A path that doesn't end at the parent itself would mis-nest every span,
/// so it falls back to treating the parent as a top-level span.
fn parent_span(context: &ParentSpanContext) -> ParentSpan {
    let span_id = context.span_id.to_string();
    let consistent = !context.span_ids_path.is_empty()
        && context.span_ids_path.len() == context.span_path.len()
        && context.span_ids_path.last() == Some(&span_id);
    if consistent {
        return ParentSpan {
            span_id: context.span_id,
            path: context.span_path.clone(),
            ids_path: context.span_ids_path.clone(),
        };
    }
    ParentSpan {
        span_id: context.span_id,
        path: vec![
            context
                .span_path
                .last()
                .cloned()
                .unwrap_or("parent".to_string()),
        ],
        ids_path: vec![span_id],
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn parses_a_bare_trajectory() {
        let body = json!({"session_id": "s", "steps": [{"source": "user", "message": "hi"}]});
        let request = parse_request(body.to_string().as_bytes()).unwrap();
        assert_eq!(request.trajectory.session_id.as_deref(), Some("s"));
        assert_eq!(request.trajectory.steps.len(), 1);
        assert!(request.parent_span_context.is_none());
    }

    #[test]
    fn parses_the_envelope_in_either_case() {
        let trace_id = Uuid::new_v4();
        let span_id = Uuid::new_v4();
        let body = json!({
            "trajectory": {"steps": []},
            "parent_span_context": {
                "traceId": trace_id,
                "span_id": span_id,
                "spanPath": ["agent"],
                "spanIdsPath": [span_id.to_string()]
            },
            "sessionId": "sess",
            "metadata": {"k": "v"}
        });
        let request = parse_request(body.to_string().as_bytes()).unwrap();
        let options = convert_options(Uuid::nil(), &request);
        assert_eq!(options.trace_id, trace_id);
        assert_eq!(options.session_id.as_deref(), Some("sess"));
        assert_eq!(options.metadata.get("k"), Some(&json!("v")));
        let parent = options.parent.unwrap();
        assert_eq!(parent.path, vec!["agent".to_string()]);
        assert_eq!(parent.ids_path, vec![span_id.to_string()]);
    }

    #[test]
    fn inconsistent_parent_path_falls_back_to_top_level() {
        let span_id = Uuid::new_v4();
        let context = ParentSpanContext {
            trace_id: Uuid::new_v4(),
            span_id,
            span_path: vec!["root".to_string(), "agent".to_string()],
            span_ids_path: vec![Uuid::new_v4().to_string()],
        };
        let parent = parent_span(&context);
        assert_eq!(parent.path, vec!["agent".to_string()]);
        assert_eq!(parent.ids_path, vec![span_id.to_string()]);
    }

    #[test]
    fn rejects_non_trajectory_json() {
        assert!(parse_request(b"[1, 2]").is_err());
        assert!(parse_request(b"not json").is_err());
    }
}
