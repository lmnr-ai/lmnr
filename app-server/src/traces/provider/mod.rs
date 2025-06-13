mod openai;

use crate::db::spans::{Span, SpanType};

pub fn convert_span_to_provider_format(span: &mut Span) {
    if span.span_type != SpanType::LLM {
        return;
    }
    let provider_name = span
        .attributes
        .get("gen_ai.system")
        .and_then(|v| v.as_str());
    match provider_name {
        Some("openai") => {
            openai::convert_span_to_openai(span);
        }
        _ => {}
    }
}
