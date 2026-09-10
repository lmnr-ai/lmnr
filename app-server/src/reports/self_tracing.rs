//! Internal tracing for report-summary LLM calls.

use tracing::info_span;
use uuid::Uuid;

use crate::env::connections::REPORTS_INTERNAL_PROJECT_ID;
use crate::instrumentation::spans::{InternalSpan, SpanContextCarrier, SpanType};

const INTERNAL_TRACING_TARGET: &str = "lmnr::internal";
const ROOT_SPAN_NAME: &str = "report.generate_summary";

#[derive(Clone)]
pub(super) struct SpanScope {
    internal_project_id: Option<Uuid>,
    report_id: Uuid,
    workspace_id: Uuid,
    source_project_id: Uuid,
    period_start: i64,
    period_end: i64,
    parent: Option<SpanContextCarrier>,
}

impl SpanScope {
    pub(super) fn new(
        report_id: Uuid,
        workspace_id: Uuid,
        source_project_id: Uuid,
        period_start: i64,
        period_end: i64,
    ) -> Self {
        Self {
            internal_project_id: std::env::var(REPORTS_INTERNAL_PROJECT_ID)
                .ok()
                .and_then(|value| Uuid::parse_str(&value).ok()),
            report_id,
            workspace_id,
            source_project_id,
            period_start,
            period_end,
            parent: None,
        }
    }

    pub(super) fn with_parent(&self, parent: Option<SpanContextCarrier>) -> Self {
        Self {
            parent,
            ..self.clone()
        }
    }
}

pub(super) struct SpanBuilder;

impl SpanBuilder {
    fn base(span: InternalSpan, scope: &SpanScope) -> InternalSpan {
        let source_project_id = scope.source_project_id.to_string();
        span.project(scope.internal_project_id)
            .span_path_root(ROOT_SPAN_NAME)
            .session_id(&scope.report_id.to_string())
            .metadata_str("report_id", &scope.report_id.to_string())
            .metadata_str("workspace_id", &scope.workspace_id.to_string())
            .metadata_str("project_id", &source_project_id)
            .metadata_str("period_start", &scope.period_start.to_string())
            .metadata_str("period_end", &scope.period_end.to_string())
    }

    pub(super) fn root(scope: &SpanScope) -> tracing::Span {
        Self::base(
            InternalSpan::wrap(
                info_span!(target: INTERNAL_TRACING_TARGET, parent: None, "report.generate_summary"),
                SpanType::Default,
            ),
            scope,
        )
        .build()
    }

    pub(super) fn llm(scope: &SpanScope) -> InternalSpan {
        Self::base(
            InternalSpan::wrap(
                info_span!(target: INTERNAL_TRACING_TARGET, "llm_call"),
                SpanType::LLM,
            ),
            scope,
        )
        .parent(scope.parent)
    }
}
