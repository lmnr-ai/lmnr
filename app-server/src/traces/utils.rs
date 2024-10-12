use std::sync::Arc;

use crate::language_model::{
    ExecuteChatCompletion, LanguageModelProviderName, LanguageModelRunner,
};

use super::spans::{SpanAttributes, SpanUsage};

/// Calculate usage for both default and LLM spans
pub fn get_llm_usage_for_span(
    // mut because input and output tokens are updated to new convention
    attributes: &mut SpanAttributes,
    language_model_runner: Arc<LanguageModelRunner>,
) -> SpanUsage {
    let input_tokens = attributes.input_tokens();
    let output_tokens = attributes.completion_tokens();
    let total_tokens = input_tokens + output_tokens;

    let mut input_cost: f64 = 0.0;
    let mut output_cost: f64 = 0.0;
    let mut total_cost: f64 = 0.0;

    let response_model = attributes.response_model();
    let model_name = response_model.or(attributes.request_model());
    let provider_name = attributes.provider_name();
    let provider = provider_name
        .clone()
        .and_then(|v| LanguageModelProviderName::from_str(&v.to_lowercase()).ok())
        .and_then(|name| language_model_runner.models.get(&name).cloned());

    // TODO: Think about it. Maybe first see if prices are present in the attributes.
    if let Some(model) = model_name.as_deref() {
        if let Some(provider) = provider {
            input_cost = provider
                .estimate_input_cost(model, input_tokens as u32)
                .unwrap_or(0.0);
            output_cost = provider
                .estimate_output_cost(model, output_tokens as u32)
                .unwrap_or(0.0);
            total_cost = input_cost + output_cost;
        }
    }

    SpanUsage {
        input_tokens,
        output_tokens,
        total_tokens,
        input_cost,
        output_cost,
        total_cost,
        response_model: attributes.request_model().clone(),
        request_model: attributes.request_model().clone(),
        provider_name,
    }
}
