//! Generic builder for Laminar-internal OTEL self-tracing spans — shared attribute conventions
//! (`lmnr.span.*` / `gen_ai.*` / `signal.*` / association props) + per-span project routing
//! ([`INTERNAL_PROJECT_ID_ATTR`]). Producers wrap it with a thin facade (see `crate::agent::spans`).
//!
//! Span *creation* stays at the producer's call site (via `info_span!` on the `lmnr::internal`
//! target) because the macro needs a literal name; [`InternalSpan::wrap`] then tags + augments it.

use serde_json::Value;
use tracing_opentelemetry::OpenTelemetrySpanExt;
use uuid::Uuid;

use super::INTERNAL_PROJECT_ID_ATTR;

/// Drives `lmnr.span.type` via `Display`. Reused from the DB layer so signals shares the enum.
pub use crate::db::spans::SpanType;

// Macros need a literal; mirrors `super::INTERNAL_TRACING_TARGET`. Used by `record_error`.
const INTERNAL_TRACING_TARGET: &str = "lmnr::internal";

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

    /// Destination project for the exporter. `None` → not stamped (internal tracing disabled).
    pub fn project(self, project_id: Option<Uuid>) -> Self {
        if let Some(project_id) = project_id {
            self.span
                .set_attribute(INTERNAL_PROJECT_ID_ATTR, project_id.to_string());
        }
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

pub fn set_output(span: &tracing::Span, output: &Value) {
    span.set_attribute("lmnr.span.output", json_attr(output));
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
    fn span_type_maps_to_ingest_attribute_strings() {
        assert_eq!(SpanType::Default.to_string(), "DEFAULT");
        assert_eq!(SpanType::LLM.to_string(), "LLM");
        assert_eq!(SpanType::Tool.to_string(), "TOOL");
    }
}
