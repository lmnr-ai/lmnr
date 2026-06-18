//! Generic builder for Laminar-internal OTEL self-tracing spans — shared attribute conventions
//! (`lmnr.span.*` / `gen_ai.*` / `signal.*` / association props) + per-span project routing
//! ([`INTERNAL_PROJECT_ID_ATTR`]). Producers wrap it with a thin facade (see `crate::agent::spans`).
//!
//! Span *creation* stays at the producer's call site (via `info_span!` on the `lmnr::internal`
//! target) because the macro needs a literal name; [`InternalSpan::wrap`] then tags + augments it.

use opentelemetry::Context;
use opentelemetry::trace::{SpanContext, SpanId, TraceContextExt, TraceFlags, TraceId, TraceState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing_opentelemetry::OpenTelemetrySpanExt;
use uuid::Uuid;

use super::INTERNAL_PROJECT_ID_ATTR;

/// Drives `lmnr.span.type` via `Display`. Reused from the DB layer so signals shares the enum.
pub use crate::db::spans::SpanType;

// Macros need a literal; mirrors `super::INTERNAL_TRACING_TARGET`. Used by `record_error`.
const INTERNAL_TRACING_TARGET: &str = "lmnr::internal";

/// Serializable handle to a live span, so a parent minted in one process can re-root child spans
/// minted in another (e.g. signals carries it across RabbitMQ). Holds the native OTEL ids directly:
/// 16-byte trace id + 8-byte span id, matching the SDK's own widths.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SpanContextCarrier {
    pub trace_id: u128,
    pub span_id: u64,
}

impl SpanContextCarrier {
    /// Capture the OTEL context of a live span. `None` if the span isn't sampled/recording (e.g.
    /// internal tracing disabled), in which case children simply root their own traces.
    pub fn from_span(span: &tracing::Span) -> Option<Self> {
        let span_context = span.context().span().span_context().clone();
        span_context.is_valid().then(|| Self {
            trace_id: u128::from_be_bytes(span_context.trace_id().to_bytes()),
            span_id: u64::from_be_bytes(span_context.span_id().to_bytes()),
        })
    }

    /// Parse a W3C `traceparent` (`version-traceid-spanid-flags`, e.g.
    /// `00-<32hex>-<16hex>-01`) into a carrier so an out-of-process caller's span can become the
    /// parent of an internally-traced run. The hex `traceid`/`spanid` are the native OTEL ids (NOT
    /// Laminar UUIDs). Returns `None` on any malformed or all-zero component so a bad header
    /// degrades to a fresh root rather than erroring.
    pub fn from_w3c_traceparent(traceparent: &str) -> Option<Self> {
        let mut parts = traceparent.trim().split('-');
        let _version = parts.next()?;
        let trace_id = u128::from_str_radix(parts.next()?, 16).ok()?;
        let span_id = u64::from_str_radix(parts.next()?, 16).ok()?;
        (trace_id != 0 && span_id != 0).then_some(Self { trace_id, span_id })
    }

    /// Rebuild an OTEL [`Context`] referencing the captured span, suitable for
    /// [`OpenTelemetrySpanExt::set_parent`]. Marked remote since it crossed a process boundary.
    fn as_remote_context(&self) -> Context {
        let span_context = SpanContext::new(
            TraceId::from_bytes(self.trace_id.to_be_bytes()),
            SpanId::from_bytes(self.span_id.to_be_bytes()),
            TraceFlags::SAMPLED,
            true,
            TraceState::NONE,
        );
        Context::new().with_remote_span_context(span_context)
    }
}

/// Fluent builder; setters consume `self`, post-build mutations use the free `set_*` helpers.
pub struct InternalSpan {
    span: tracing::Span,
}

impl InternalSpan {
    /// Tag a caller-created span (which MUST be on the `lmnr::internal` target) with its Laminar type.
    pub fn wrap(span: tracing::Span, span_type: SpanType) -> Self {
        span.set_attribute("lmnr.span.type", span_type.to_string());
        Self { span }
    }

    /// Re-root this span under a parent captured in another process (carried e.g. over RabbitMQ).
    /// `None` leaves the span as whatever `info_span!` made it (a fresh root when `parent: None`).
    pub fn parent(self, parent: Option<SpanContextCarrier>) -> Self {
        if let Some(parent) = parent {
            self.span.set_parent(parent.as_remote_context());
        }
        self
    }

    /// Destination project for the exporter. `None` → not stamped (internal tracing disabled).
    pub fn project(self, project_id: Option<Uuid>) -> Self {
        if let Some(project_id) = project_id {
            self.span
                .set_attribute(INTERNAL_PROJECT_ID_ATTR, project_id.to_string());
        }
        self
    }

    /// Seed `lmnr.span.path` with the trace root name (1-element array). Ingest's `extend_span_path`
    /// appends each span's own name, so every child's `path[0]` is the root — letting the trace
    /// aggregation resolve the top-span name even when the root lands in its own batch. Must be an
    /// array: `extend_span_path` appends to an array but overwrites a scalar.
    pub fn span_path_root(self, root_name: &str) -> Self {
        self.span.set_attribute(
            "lmnr.span.path",
            opentelemetry::Value::Array(opentelemetry::Array::String(vec![
                root_name.to_string().into(),
            ])),
        );
        self
    }

    pub fn input(self, input: &Value) -> Self {
        self.span.set_attribute("lmnr.span.input", json_attr(input));
        self
    }

    pub fn model(self, provider: &str, model: &str) -> Self {
        self.span
            .set_attribute("gen_ai.request.model", model.to_string());
        self.span
            .set_attribute("gen_ai.system", provider.to_string());
        self
    }

    pub fn tools(self, tools: Option<&Value>) -> Self {
        if let Some(tools) = tools {
            self.span
                .set_attribute("ai.prompt.tools", tools_attr(tools));
        }
        self
    }

    pub fn event_name(self, name: &str) -> Self {
        self.span
            .set_attribute("signal.event_name", name.to_string());
        self
    }

    pub fn run_id(self, run_id: Uuid) -> Self {
        self.span.set_attribute("signal.run_id", run_id.to_string());
        self
    }

    /// `signal.job_id`; `None` (triggered/realtime runs) is skipped.
    pub fn job_id(self, job_id: Option<Uuid>) -> Self {
        if let Some(job_id) = job_id {
            self.span.set_attribute("signal.job_id", job_id.to_string());
        }
        self
    }

    /// `signal.step` — the agent-loop step index. Span-specific (unlike trace metadata, which must be
    /// uniform across the trace), so it rides a dedicated attribute, not `metadata.*`. Numeric so the
    /// trace UI can range-filter.
    pub fn step(self, step: usize) -> Self {
        self.span.set_attribute("signal.step", step as i64);
        self
    }

    /// Mark an LLM span as a provider batch submission: stamps the batch id plus the attributes
    /// ingest keys batch pricing/filtering off. The caller still owns the `.batch` name suffix.
    pub fn batch(self, provider_batch_id: &str) -> Self {
        self.span
            .set_attribute("signal.batch_id", provider_batch_id.to_string());
        self.span.set_attribute("gen_ai.request.batch", true);
        self.span
            .set_attribute("lmnr.association.properties.tags", "batch".to_string());
        self
    }

    /// `lmnr.association.properties.session_id`; empty ids are skipped.
    pub fn session_id(self, session_id: &str) -> Self {
        if !session_id.is_empty() {
            self.span.set_attribute(
                "lmnr.association.properties.session_id",
                session_id.to_string(),
            );
        }
        self
    }

    pub fn metadata_str(self, key: &str, value: &str) -> Self {
        set_metadata_str(&self.span, key, value);
        self
    }

    pub fn build(self) -> tracing::Span {
        self.span
    }
}

pub fn set_input(span: &tracing::Span, input: &Value) {
    span.set_attribute("lmnr.span.input", json_attr(input));
}

/// Post-build counterpart to [`InternalSpan::tools`] — used when the tools attribute is only known
/// after the call returns (e.g. preview pipelines that build the request internally).
pub fn set_tools(span: &tracing::Span, tools: &Value) {
    span.set_attribute("ai.prompt.tools", tools_attr(tools));
}

pub fn set_output(span: &tracing::Span, output: &Value) {
    span.set_attribute("lmnr.span.output", json_attr(output));
}

/// Post-build counterpart to [`InternalSpan::model`] — used when the answered model version
/// (which can differ from the requested one for proxies) is only known after the call returns.
pub fn set_model(span: &tracing::Span, provider: &str, model: &str) {
    span.set_attribute("gen_ai.request.model", model.to_string());
    span.set_attribute("gen_ai.system", provider.to_string());
}

/// Post-build counterpart to [`InternalSpan::batch`] — used when the span is built before the
/// provider `create_batch` call (to time submission latency) but batch-ness is only confirmed
/// after the call returns with an id.
pub fn set_batch(span: &tracing::Span, provider_batch_id: &str) {
    span.set_attribute("signal.batch_id", provider_batch_id.to_string());
    span.set_attribute("gen_ai.request.batch", true);
    span.set_attribute("lmnr.association.properties.tags", "batch".to_string());
}

pub fn set_usage(
    span: &tracing::Span,
    input_tokens: Option<i32>,
    cache_read_input_tokens: Option<i32>,
    output_tokens: Option<i32>,
) {
    if let Some(t) = input_tokens {
        span.set_attribute("gen_ai.usage.input_tokens", t as i64);
    }
    if let Some(t) = cache_read_input_tokens {
        span.set_attribute("gen_ai.usage.cache_read_input_tokens", t as i64);
    }
    if let Some(t) = output_tokens {
        span.set_attribute("gen_ai.usage.output_tokens", t as i64);
    }
}

pub fn set_metadata_str(span: &tracing::Span, key: &str, value: &str) {
    span.set_attribute(
        format!("lmnr.association.properties.metadata.{key}"),
        value.to_string(),
    );
}

pub fn set_metadata_i64(span: &tracing::Span, key: &str, value: i64) {
    span.set_attribute(format!("lmnr.association.properties.metadata.{key}"), value);
}

/// Set a raw, span-specific attribute (NOT `metadata.*`). Use for values that vary span-to-span
/// (cache keys, fingerprints, hashes) — trace metadata must be uniform across the trace, so those
/// belong here instead. Stored verbatim in the ingested span's attributes.
pub fn set_attr_str(span: &tracing::Span, key: &str, value: &str) {
    span.set_attribute(key.to_string(), value.to_string());
}

pub fn set_attr_i64(span: &tracing::Span, key: &str, value: i64) {
    span.set_attribute(key.to_string(), value);
}

/// Emit an `exception` event — ingest derives error status from this, not an `error` attribute.
pub fn record_error(span: &tracing::Span, message: String) {
    tracing::error!(target: INTERNAL_TRACING_TARGET, parent: span, error = %message);
}

// Ingest re-parses these from a JSON string, so structured values must serialise.
fn json_attr(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_default()
}

// `ai.prompt.tools` must be an OTEL string array (one tool per element); ingest drops a single blob.
fn tools_attr(tools: &Value) -> opentelemetry::Value {
    let elems: Vec<opentelemetry::StringValue> = match tools {
        Value::Array(items) => items.iter().map(json_attr).map(Into::into).collect(),
        other => vec![json_attr(other).into()],
    };
    opentelemetry::Value::Array(opentelemetry::Array::String(elems))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn json_attr_serialises_value_to_string() {
        let s = json_attr(&json!({"role": "model", "parts": [{"text": "hi"}]}));
        let round: Value = serde_json::from_str(&s).unwrap();
        assert_eq!(round["role"].as_str(), Some("model"));
        assert_eq!(round["parts"][0]["text"].as_str(), Some("hi"));
    }

    #[test]
    fn tools_attr_emits_array_of_stringified_tools() {
        let tools = json!([
            {"type": "function", "name": "a", "parameters": {}},
            {"type": "function", "name": "b", "parameters": {}},
        ]);
        let attr = tools_attr(&tools);
        let opentelemetry::Value::Array(opentelemetry::Array::String(elems)) = attr else {
            panic!("expected an OTEL string array");
        };
        assert_eq!(elems.len(), 2);
        let first: Value = serde_json::from_str(elems[0].as_str()).unwrap();
        assert_eq!(first["name"].as_str(), Some("a"));
        let second: Value = serde_json::from_str(elems[1].as_str()).unwrap();
        assert_eq!(second["name"].as_str(), Some("b"));
    }

    #[test]
    fn carrier_round_trips_through_json() {
        let carrier = SpanContextCarrier {
            trace_id: 0x0102_0304_0506_0708_090a_0b0c_0d0e_0f10,
            span_id: 0xa1b2_c3d4_e5f6_0708,
        };
        let json = serde_json::to_string(&carrier).unwrap();
        let back: SpanContextCarrier = serde_json::from_str(&json).unwrap();
        assert_eq!(carrier, back);
    }

    #[test]
    fn carrier_rebuilds_a_valid_remote_span_context() {
        let carrier = SpanContextCarrier {
            trace_id: 42,
            span_id: 7,
        };
        let cx = carrier.as_remote_context();
        let span_context = cx.span().span_context().clone();
        assert!(span_context.is_valid());
        assert!(span_context.is_remote());
        assert_eq!(
            span_context.trace_id(),
            TraceId::from_bytes(42u128.to_be_bytes())
        );
        assert_eq!(
            span_context.span_id(),
            SpanId::from_bytes(7u64.to_be_bytes())
        );
    }

    #[test]
    fn span_type_maps_to_ingest_attribute_strings() {
        assert_eq!(SpanType::Default.to_string(), "DEFAULT");
        assert_eq!(SpanType::LLM.to_string(), "LLM");
        assert_eq!(SpanType::Tool.to_string(), "TOOL");
    }
}
