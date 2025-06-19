mod langchain;
mod openai;

use serde_json::Value;

use crate::db::spans::{Span, SpanType};

pub fn convert_span_to_provider_format(span: &mut Span) {
    if span.span_type != SpanType::LLM {
        return;
    }
    let provider_name = span
        .attributes
        .get("gen_ai.system")
        .and_then(|v| v.as_str());
    if is_ai_sdk_llm_span(span) {
        return;
    }
    if is_litellm_span(span) {
        openai::convert_span_to_openai(span);
        return;
    }
    match provider_name {
        Some("openai") => {
            openai::convert_span_to_openai(span);
        }
        _ => {}
    }
}

fn is_ai_sdk_llm_span(span: &Span) -> bool {
    span.span_type == SpanType::LLM
        && (span.attributes.get("ai.operationId").is_some()
            || span.attributes.get("ai.model.provider").is_some())
}

fn is_litellm_span(span: &Span) -> bool {
    span.attributes.get("lmnr.internal.provider") == Some(&Value::String("litellm".to_string()))
}
