mod langchain;

use crate::{
    db::spans::{Span, SpanType},
    traces::provider::langchain::is_langchain_span,
};

pub fn convert_span_to_provider_format(span: &mut Span) {
    if span.span_type != SpanType::LLM {
        return;
    }
    if is_ai_sdk_llm_span(span) {
        return;
    }
    if is_langchain_span(span) {
        langchain::convert_span_to_langchain(span);
        return;
    }
}

fn is_ai_sdk_llm_span(span: &Span) -> bool {
    span.is_llm_span()
        && (span
            .attributes
            .raw_attributes
            .get("ai.operationId")
            .is_some()
            || span
                .attributes
                .raw_attributes
                .get("ai.model.provider")
                .is_some())
}
