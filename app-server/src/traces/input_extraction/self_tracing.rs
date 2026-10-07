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

/// Root span names, one per pipeline. Each doubles as the `lmnr.span.path[0]` value
/// [`SpanBuilder::base`] stamps on EVERY descendant — ingest resolves the trace's top-span name
/// from `path[0]` when the root lands in its own export batch, so the root literal and the path
/// root must never diverge. [`SpanBuilder::root`] uses these same constants, which is what keeps
/// them in step.
const VERSION_REGEX_ROOT_SPAN_NAME: &str = "user_task.version_regex";
const DIRECT_EXTRACTION_ROOT_SPAN_NAME: &str = "user_task.extract_direct";
const LEGACY_FINGERPRINT_ROOT_SPAN_NAME: &str = "user_task.extract_legacy";

/// Which of the three extraction pipelines a self-traced run belongs to. They are deliberately
/// named apart end-to-end (root, LLM and tool spans all differ) because they have completely
/// different cost profiles, sample counts and failure modes — sharing names made it impossible to
/// tell them apart in the trace UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunKind {
    /// Multi-sample regex generation for one prompt version. Cohort-scoped, not trace-scoped.
    VersionRegex,
    /// One-shot LLM extraction — the prompt has no version, or its version has no regex yet.
    /// Caches nothing.
    DirectExtraction,
    /// Single-sample regex generation keyed by user-message fingerprint: the permanent path for
    /// LLM spans with no system prompt, and the whole pipeline while the versioned flag is off.
    LegacyFingerprint,
}

impl RunKind {
    fn root_span_name(self) -> &'static str {
        match self {
            RunKind::VersionRegex => VERSION_REGEX_ROOT_SPAN_NAME,
            RunKind::DirectExtraction => DIRECT_EXTRACTION_ROOT_SPAN_NAME,
            RunKind::LegacyFingerprint => LEGACY_FINGERPRINT_ROOT_SPAN_NAME,
        }
    }
}

/// Per-run identity threaded through the extraction pipeline; every self-tracing span is
/// stamped with it. `project_id` is the exporter's routing target (`None` ⇒ internal tracing
/// disabled, spans are no-ops); `parent` is the reattach point for children built in callee
/// functions.
#[derive(Debug, Clone)]
pub struct SpanScope {
    pub project_id: Option<Uuid>,
    /// The project owning the trace under extraction (NOT the internal routing target above).
    /// Stamped as `metadata.project_id` and as the span `user_id` on every span, so internal
    /// traces can be grouped/filtered by the analyzed project.
    pub source_project_id: Uuid,
    /// The trace under extraction, or nil for a cohort-scoped run that belongs to no single trace.
    /// Stamped as `metadata.trace_id` on every span so it survives trace-metadata aggregation
    /// (ingest takes only one span's metadata per export batch).
    pub trace_id: Uuid,
    /// Which pipeline is running — picks the root span name and the path root.
    pub kind: RunKind,
    /// Parent captured from the root span. `None` roots a fresh internal trace.
    pub parent: Option<SpanContextCarrier>,
}

impl SpanScope {
    pub fn new(source_project_id: Uuid, trace_id: Uuid, kind: RunKind) -> Self {
        Self {
            project_id: internal_project_id(),
            source_project_id,
            trace_id,
            kind,
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
        let source_project_id = scope.source_project_id.to_string();
        span.project(scope.project_id)
            .span_path_root(scope.kind.root_span_name())
            .user_id(&source_project_id)
            .metadata_str("project_id", &source_project_id)
            .metadata_str("trace_id", &scope.trace_id.to_string())
    }

    /// The per-run root — fresh internal trace, no reattach. Capture the built span with
    /// [`SpanContextCarrier::from_span`] so children reattach. The literals here are the same
    /// constants [`RunKind::root_span_name`] returns, so the root name and `lmnr.span.path[0]`
    /// cannot drift apart.
    pub fn root(scope: &SpanScope) -> InternalSpan {
        let span = match scope.kind {
            RunKind::VersionRegex => {
                info_span!(target: INTERNAL_TRACING_TARGET, parent: None, VERSION_REGEX_ROOT_SPAN_NAME)
            }
            RunKind::DirectExtraction => {
                info_span!(target: INTERNAL_TRACING_TARGET, parent: None, DIRECT_EXTRACTION_ROOT_SPAN_NAME)
            }
            RunKind::LegacyFingerprint => {
                info_span!(target: INTERNAL_TRACING_TARGET, parent: None, LEGACY_FINGERPRINT_ROOT_SPAN_NAME)
            }
        };
        Self::base(InternalSpan::wrap(span, SpanType::Default), scope)
    }

    pub fn llm(scope: &SpanScope, name: &str) -> InternalSpan {
        let span = match name {
            "generate_extraction_regex" => {
                info_span!(target: INTERNAL_TRACING_TARGET, "generate_extraction_regex")
            }
            "generate_extraction_regex_multi" => {
                info_span!(target: INTERNAL_TRACING_TARGET, "generate_extraction_regex_multi")
            }
            "extract_user_task" => {
                info_span!(target: INTERNAL_TRACING_TARGET, "extract_user_task")
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
            "try_extraction_regex_multi" => {
                info_span!(target: INTERNAL_TRACING_TARGET, "try_extraction_regex_multi")
            }
            "apply_regex" => {
                info_span!(target: INTERNAL_TRACING_TARGET, "apply_regex")
            }
            _ => info_span!(target: INTERNAL_TRACING_TARGET, "user_task.tool"),
        };
        Self::base(InternalSpan::wrap(span, SpanType::Tool), scope).parent(scope.parent)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The three pipelines must never share a root name — that is the whole point
    /// of the split, and a collision would silently merge them in the trace UI
    /// again. Also pins the `lmnr.span.path[0]` values, which ingest reads as the
    /// trace's top-span name.
    #[test]
    fn run_kinds_have_distinct_stable_root_names() {
        let names = [
            RunKind::VersionRegex.root_span_name(),
            RunKind::DirectExtraction.root_span_name(),
            RunKind::LegacyFingerprint.root_span_name(),
        ];
        assert_eq!(
            names,
            [
                "user_task.version_regex",
                "user_task.extract_direct",
                "user_task.extract_legacy",
            ]
        );
        let unique: std::collections::HashSet<_> = names.iter().collect();
        assert_eq!(unique.len(), names.len(), "root names must be distinct");
    }

    #[test]
    fn scope_carries_its_kind_through_reparenting() {
        let scope = SpanScope::new(Uuid::new_v4(), Uuid::new_v4(), RunKind::VersionRegex);
        assert_eq!(scope.with_parent(None).kind, RunKind::VersionRegex);
    }
}
