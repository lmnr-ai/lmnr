//! In-process exporter for internal self-tracing spans: maps SDK `SpanData` onto the proto request
//! and calls [`push_spans_to_queue`] directly (no OTLP loopback, no API key). Destination project
//! is read per-span from [`INTERNAL_PROJECT_ID_ATTR`], so one exporter fans out to many projects.
//!
//! Threading: the batch processor drives [`SpanExporter::export`] on its own non-tokio thread, so
//! the exporter holds a runtime [`Handle`] and `block_on`s the async ingest on it.
//!
//! Deferred deps: `setup_tracing_and_logging` runs before the queue/DB/cache exist, so the exporter
//! holds a [`OnceLock`] of [`IngestDeps`] that `main` fills later (spans drop until then).

use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use opentelemetry::Value as OtelValue;
use opentelemetry_sdk::error::{OTelSdkError, OTelSdkResult};
use opentelemetry_sdk::trace::{SpanData, SpanExporter};
use tokio::runtime::Handle;
use uuid::Uuid;

use crate::cache::Cache;
use crate::db::DB;
use crate::mq::MessageQueue;
use crate::opentelemetry_proto::opentelemetry::proto::collector::trace::v1::ExportTraceServiceRequest;
use crate::opentelemetry_proto::opentelemetry_proto_common_v1::{
    AnyValue, ArrayValue, KeyValue, any_value::Value as ProtoValue,
};
use crate::opentelemetry_proto::opentelemetry_proto_trace_v1::{
    ResourceSpans, ScopeSpans, Span as ProtoSpan, span::Event as ProtoEvent,
};
use crate::traces::producer::push_spans_to_queue;

use super::INTERNAL_PROJECT_ID_ATTR;

/// Ingest dependencies, populated by `main` once constructed. Project id is not held here — it
/// travels per-span on [`INTERNAL_PROJECT_ID_ATTR`].
pub struct IngestDeps {
    pub queue: Arc<MessageQueue>,
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
}

/// Shared, late-populated handle to [`IngestDeps`]; `main` fills it after building the services.
pub type SharedIngestDeps = Arc<OnceLock<IngestDeps>>;

#[derive(Clone)]
pub struct InProcessInternalExporter {
    deps: SharedIngestDeps,
    runtime: Handle,
}

impl std::fmt::Debug for InProcessInternalExporter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("InProcessInternalExporter")
            .field("deps_ready", &self.deps.get().is_some())
            .finish()
    }
}

impl InProcessInternalExporter {
    pub fn new(deps: SharedIngestDeps, runtime: Handle) -> Self {
        Self { deps, runtime }
    }
}

impl SpanExporter for InProcessInternalExporter {
    async fn export(&self, batch: Vec<SpanData>) -> OTelSdkResult {
        let Some(deps) = self.deps.get() else {
            // No deps yet (pre-boot) — nothing can be ingested. Drop silently.
            return Ok(());
        };

        // Each span carries its own destination project id, so group the batch by project and run
        // one ingest per group. Spans without a routable project id are dropped (logged).
        let mut by_project: HashMap<Uuid, Vec<ProtoSpan>> = HashMap::new();
        for span in batch {
            let (proto, project_id) = span_data_to_proto(span);
            match project_id {
                Some(project_id) => by_project.entry(project_id).or_default().push(proto),
                None => log::warn!(
                    "internal span '{}' missing {INTERNAL_PROJECT_ID_ATTR}; dropping",
                    proto.name
                ),
            }
        }

        let mut last_err = None;
        for (project_id, spans) in by_project {
            let request = ExportTraceServiceRequest {
                resource_spans: vec![ResourceSpans {
                    resource: None,
                    scope_spans: vec![ScopeSpans {
                        scope: None,
                        spans,
                        schema_url: String::new(),
                    }],
                    schema_url: String::new(),
                }],
            };

            let queue = deps.queue.clone();
            let db = deps.db.clone();
            let cache = deps.cache.clone();

            // The processor calls us on a dedicated non-tokio thread, so drive the async ingest on
            // the runtime handle. block_on is safe here: this thread exists only to run exports.
            let result = self.runtime.block_on(async move {
                push_spans_to_queue(request, project_id, queue, db, cache).await
            });
            if let Err(e) = result {
                log::error!("internal span ingest failed for project {project_id}: {e:#}");
                last_err = Some(e);
            }
        }

        match last_err {
            Some(e) => Err(OTelSdkError::InternalFailure(format!(
                "internal span ingest failed: {e:#}"
            ))),
            None => Ok(()),
        }
    }
}

/// Convert one SDK span to proto, extracting + stripping the [`INTERNAL_PROJECT_ID_ATTR`] routing
/// attribute. `None` project id (missing/invalid) → unroutable, dropped by the caller.
fn span_data_to_proto(span: SpanData) -> (ProtoSpan, Option<Uuid>) {
    let mut project_id = None;
    let attributes = span
        .attributes
        .into_iter()
        .filter_map(|kv| {
            if kv.key.as_str() == INTERNAL_PROJECT_ID_ATTR {
                if let OtelValue::String(s) = kv.value {
                    project_id = Uuid::parse_str(s.as_str()).ok();
                }
                // Routing-only attribute — don't store it on the ingested span.
                None
            } else {
                Some(KeyValue {
                    key: kv.key.as_str().to_string(),
                    value: Some(otel_value_to_any(kv.value)),
                })
            }
        })
        .collect();

    let events = span
        .events
        .into_iter()
        .map(|event| ProtoEvent {
            time_unix_nano: system_time_to_nanos(event.timestamp),
            name: event.name.into_owned(),
            attributes: event
                .attributes
                .into_iter()
                .map(|kv| KeyValue {
                    key: kv.key.as_str().to_string(),
                    value: Some(otel_value_to_any(kv.value)),
                })
                .collect(),
            dropped_attributes_count: 0,
        })
        .collect();

    let parent_span_id = if span.parent_span_id == opentelemetry::trace::SpanId::INVALID {
        Vec::new()
    } else {
        span.parent_span_id.to_bytes().to_vec()
    };

    let proto = ProtoSpan {
        trace_id: span.span_context.trace_id().to_bytes().to_vec(),
        span_id: span.span_context.span_id().to_bytes().to_vec(),
        trace_state: String::new(),
        parent_span_id,
        flags: 0,
        name: span.name.into_owned(),
        kind: 0,
        start_time_unix_nano: system_time_to_nanos(span.start_time),
        end_time_unix_nano: system_time_to_nanos(span.end_time),
        attributes,
        dropped_attributes_count: 0,
        events,
        dropped_events_count: 0,
        links: Vec::new(),
        dropped_links_count: 0,
        status: None,
    };
    (proto, project_id)
}

fn otel_value_to_any(value: OtelValue) -> AnyValue {
    let proto = match value {
        OtelValue::Bool(b) => ProtoValue::BoolValue(b),
        OtelValue::I64(i) => ProtoValue::IntValue(i),
        OtelValue::F64(f) => ProtoValue::DoubleValue(f),
        OtelValue::String(s) => ProtoValue::StringValue(s.to_string()),
        OtelValue::Array(array) => ProtoValue::ArrayValue(otel_array_to_proto(array)),
        // `Value` is #[non_exhaustive]; stringify any future variant rather than drop it.
        other => ProtoValue::StringValue(other.to_string()),
    };
    AnyValue { value: Some(proto) }
}

fn otel_array_to_proto(array: opentelemetry::Array) -> ArrayValue {
    use opentelemetry::Array;
    let values = match array {
        Array::Bool(items) => items
            .into_iter()
            .map(|b| AnyValue {
                value: Some(ProtoValue::BoolValue(b)),
            })
            .collect(),
        Array::I64(items) => items
            .into_iter()
            .map(|i| AnyValue {
                value: Some(ProtoValue::IntValue(i)),
            })
            .collect(),
        Array::F64(items) => items
            .into_iter()
            .map(|f| AnyValue {
                value: Some(ProtoValue::DoubleValue(f)),
            })
            .collect(),
        Array::String(items) => items
            .into_iter()
            .map(|s| AnyValue {
                value: Some(ProtoValue::StringValue(s.to_string())),
            })
            .collect(),
        // `Array` is #[non_exhaustive]; a future variant yields an empty array
        // rather than a compile break.
        _ => Vec::new(),
    };
    ArrayValue { values }
}

fn system_time_to_nanos(time: std::time::SystemTime) -> u64 {
    time.duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;
    use std::time::{Duration, UNIX_EPOCH};

    use opentelemetry::trace::{
        Event as OtelEvent, SpanContext, SpanId, SpanKind, Status, TraceFlags, TraceId, TraceState,
    };
    use opentelemetry::{InstrumentationScope, KeyValue};
    use opentelemetry_sdk::trace::{SpanData, SpanEvents, SpanLinks};

    use super::*;

    fn span_data(parent: SpanId, attrs: Vec<KeyValue>, events: Vec<OtelEvent>) -> SpanData {
        SpanData {
            span_context: SpanContext::new(
                TraceId::from_bytes([1; 16]),
                SpanId::from_bytes([2; 8]),
                TraceFlags::SAMPLED,
                false,
                TraceState::NONE,
            ),
            parent_span_id: parent,
            span_kind: SpanKind::Internal,
            name: Cow::Borrowed("trace_chat.run"),
            start_time: UNIX_EPOCH + Duration::from_nanos(10),
            end_time: UNIX_EPOCH + Duration::from_nanos(20),
            attributes: attrs,
            dropped_attributes_count: 0,
            events: {
                let mut e = SpanEvents::default();
                e.events = events;
                e
            },
            links: SpanLinks::default(),
            status: Status::Unset,
            instrumentation_scope: InstrumentationScope::builder("test").build(),
        }
    }

    #[test]
    fn maps_ids_name_and_times() {
        let (proto, _) = span_data_to_proto(span_data(SpanId::from_bytes([9; 8]), vec![], vec![]));
        assert_eq!(proto.trace_id, [1u8; 16].to_vec());
        assert_eq!(proto.span_id, [2u8; 8].to_vec());
        assert_eq!(proto.parent_span_id, [9u8; 8].to_vec());
        assert_eq!(proto.name, "trace_chat.run");
        assert_eq!(proto.start_time_unix_nano, 10);
        assert_eq!(proto.end_time_unix_nano, 20);
    }

    #[test]
    fn invalid_parent_becomes_empty_so_ingest_treats_span_as_root() {
        let (proto, _) = span_data_to_proto(span_data(SpanId::INVALID, vec![], vec![]));
        assert!(
            proto.parent_span_id.is_empty(),
            "a root span (no parent) must export an empty parent_span_id, not 8 zero bytes"
        );
    }

    #[test]
    fn maps_scalar_and_array_attribute_values() {
        let (proto, _) = span_data_to_proto(span_data(
            SpanId::INVALID,
            vec![
                KeyValue::new("lmnr.span.type", "DEFAULT"),
                KeyValue::new("gen_ai.usage.input_tokens", 42i64),
                KeyValue::new(
                    "ai.prompt.tools",
                    opentelemetry::Value::Array(opentelemetry::Array::String(vec![
                        "a".into(),
                        "b".into(),
                    ])),
                ),
            ],
            vec![],
        ));
        let by_key = |k: &str| {
            proto
                .attributes
                .iter()
                .find(|kv| kv.key == k)
                .and_then(|kv| kv.value.clone())
                .and_then(|v| v.value)
        };
        assert_eq!(
            by_key("lmnr.span.type"),
            Some(ProtoValue::StringValue("DEFAULT".to_string()))
        );
        assert_eq!(
            by_key("gen_ai.usage.input_tokens"),
            Some(ProtoValue::IntValue(42))
        );
        match by_key("ai.prompt.tools") {
            Some(ProtoValue::ArrayValue(arr)) => {
                let strings: Vec<_> = arr
                    .values
                    .into_iter()
                    .filter_map(|v| match v.value {
                        Some(ProtoValue::StringValue(s)) => Some(s),
                        _ => None,
                    })
                    .collect();
                assert_eq!(strings, vec!["a".to_string(), "b".to_string()]);
            }
            other => panic!("expected string array, got {other:?}"),
        }
    }

    #[test]
    fn preserves_exception_event_so_ingest_sets_error_status() {
        // Ingest derives a span's error status from an `exception` event
        // (`traces/utils.rs`), so the event name must survive conversion.
        let event = OtelEvent::new(
            "exception",
            UNIX_EPOCH + Duration::from_nanos(15),
            vec![KeyValue::new("exception.message", "boom")],
            0,
        );
        let (proto, _) = span_data_to_proto(span_data(SpanId::INVALID, vec![], vec![event]));
        assert_eq!(proto.events.len(), 1);
        assert_eq!(proto.events[0].name, "exception");
        assert_eq!(proto.events[0].time_unix_nano, 15);
        assert_eq!(proto.events[0].attributes[0].key, "exception.message");
    }

    #[test]
    fn extracts_and_strips_project_id_attribute() {
        let project_id = Uuid::from_u128(0x1234_5678);
        let (proto, extracted) = span_data_to_proto(span_data(
            SpanId::INVALID,
            vec![
                KeyValue::new(INTERNAL_PROJECT_ID_ATTR, project_id.to_string()),
                KeyValue::new("lmnr.span.type", "DEFAULT"),
            ],
            vec![],
        ));
        assert_eq!(extracted, Some(project_id));
        assert!(
            proto
                .attributes
                .iter()
                .all(|kv| kv.key != INTERNAL_PROJECT_ID_ATTR),
            "routing attribute must be stripped from the stored span attributes"
        );
        assert!(proto.attributes.iter().any(|kv| kv.key == "lmnr.span.type"));
    }

    #[test]
    fn missing_project_id_attribute_yields_none() {
        let (_proto, extracted) =
            span_data_to_proto(span_data(SpanId::INVALID, vec![], vec![]));
        assert_eq!(extracted, None);
    }
}
