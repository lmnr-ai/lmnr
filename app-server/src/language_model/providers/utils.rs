use std::collections::HashSet;

use crate::language_model::LanguageModelProviderName;

pub fn get_provider(model: &str) -> Option<&str> {
    model.split(":").next()
}

pub fn get_required_env_vars_for_model(model: &str) -> HashSet<String> {
    let provider_name = get_provider(model);
    if provider_name.is_none() {
        return HashSet::new();
    }
    let name = LanguageModelProviderName::from_str(provider_name.unwrap());
    if let Ok(provider) = name {
        provider.required_env_vars()
    } else {
        HashSet::new()
    }
}

pub fn calculate_cost(tokens: u32, price_per_million_tokens: f64) -> f64 {
    (tokens as f64 / 1_000_000.0) * price_per_million_tokens
}
