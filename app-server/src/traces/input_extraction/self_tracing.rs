//! User-task self-tracing facade over the shared `lmnr::internal` OTEL builder
//! (`crate::instrumentation::spans`), mirroring the signals facade in the private repo. Spans are
//! emitted ONLY from the queue consumer — never from the producer hook, which sits on the ingest
//! path and would recurse through `push_spans_to_queue`.
//!
//! Span names are literal `info_span!` names, not the `otel.name` field (the dynamic override is
//! unreliable).

use uuid::Uuid;

use crate::env::user_task::USER_TASK_INTERNAL_PROJECT_ID;
use crate::instrumentation::spans::{InternalSpan, SpanType};
pub(crate) use crate::instrumentation::spans::{
    SpanContextCarrier, record_error, set_attr_str, set_metadata_bool, set_output, set_usage,
};
use tracing::info_span;

const INTERNAL_TRACING_TARGET: &str = "lmnr::internal";

/// Root span name for each consumed extraction message. Seeded onto every span's `lmnr.span.path`
/// via `span_path_root` so ingest resolves the trace top-span name even when the root lands in its
/// own export batch.
pub(crate) const EXTRACT_ROOT_SPAN_NAME: &str = "user_task.extract";

/// Per-message identity threaded through the extraction pipeline; every self-tracing span is
/// stamped with it. `project_id` is the exporter's routing target (`None` ⇒ internal tracing
/// disabled, spans are no-ops); `parent` is the reattach point for children built in callee
/// functions.
#[derive(Debug, Clone)]
pub struct SpanScope {
    pub project_id: Option<Uuid>,
    /// The project owning the trace under extraction (NOT the internal routing target above).
    /// Stamped as `metadata.project_id` on every span, like `trace_id` below.
    pub source_project_id: Uuid,
    /// The trace under extraction. Stamped as `metadata.trace_id` on every span so it survives
    /// trace-metadata aggregation (ingest takes only one span's metadata per export batch).
    pub trace_id: Uuid,
    /// Parent captured from the root span. `None` roots a fresh internal trace.
    pub parent: Option<SpanContextCarrier>,
}

impl SpanScope {
    pub fn new(source_project_id: Uuid, trace_id: Uuid) -> Self {
        Self {
            project_id: internal_project_id(),
            source_project_id,
            trace_id,
            parent: None,
        }
    }

    /// Re-base children under the given parent without touching the rest of the identity.
    pub fn with_parent(&self, parent: Option<SpanContextCarrier>) -> Self {
        Self {
            parent,
            ..self.clone()
        }
    }
}

/// `mod env` shadows `std::env`, hence the fully-qualified read.
fn internal_project_id() -> Option<Uuid> {
    std::env::var(USER_TASK_INTERNAL_PROJECT_ID)
        .ok()
        .and_then(|s| Uuid::parse_str(&s).ok())
}

pub struct SpanBuilder;

impl SpanBuilder {
    fn base(span: InternalSpan, scope: &SpanScope) -> InternalSpan {
        span.project(scope.project_id)
            .span_path_root(EXTRACT_ROOT_SPAN_NAME)
            .metadata_str("project_id", &scope.source_project_id.to_string())
            .metadata_str("trace_id", &scope.trace_id.to_string())
    }

    /// The per-message root (`user_task.extract`) — fresh internal trace, no reattach. Capture the
    /// built span with [`SpanContextCarrier::from_span`] so children reattach.
    pub fn root(scope: &SpanScope) -> InternalSpan {
        let span = info_span!(target: INTERNAL_TRACING_TARGET, parent: None, "user_task.extract");
        Self::base(InternalSpan::wrap(span, SpanType::Default), scope)
    }

    pub fn llm(scope: &SpanScope, name: &str) -> InternalSpan {
        let span = match name {
            "generate_extraction_regex" => {
                info_span!(target: INTERNAL_TRACING_TARGET, "generate_extraction_regex")
            }
            _ => info_span!(target: INTERNAL_TRACING_TARGET, "user_task.llm"),
        };
        Self::base(InternalSpan::wrap(span, SpanType::LLM), scope).parent(scope.parent)
    }

    pub fn tool(scope: &SpanScope, name: &str) -> InternalSpan {
        let span = match name {
            "try_extraction_regex" => {
                info_span!(target: INTERNAL_TRACING_TARGET, "try_extraction_regex")
            }
            "apply_regex" => {
                info_span!(target: INTERNAL_TRACING_TARGET, "apply_regex")
            }
            _ => info_span!(target: INTERNAL_TRACING_TARGET, "user_task.tool"),
        };
        Self::base(InternalSpan::wrap(span, SpanType::Tool), scope).parent(scope.parent)
    }
}
