use std::{collections::HashMap, sync::Arc};

use serde::{Deserialize, Serialize};

use crate::{
    cache::{keys::LLM_PRICES_CACHE_KEY, Cache, CacheTrait},
    db::{
        prices::{get_price, DBPriceEntry},
        DB,
    },
    traces::spans::InputTokens,
};

use super::providers::utils::calculate_cost;

#[derive(Clone, Deserialize, Serialize)]
pub struct LLMPriceEntry {
    _provider: String,
    _model: String,
    input_price_per_million: f64,
    output_price_per_million: f64,
    input_cached_price_per_million: Option<f64>,
    additional_prices: HashMap<String, f64>,
}

impl From<DBPriceEntry> for LLMPriceEntry {
    fn from(value: DBPriceEntry) -> Self {
        Self {
            _provider: value.provider,
            _model: value.model,
            input_price_per_million: value.input_price_per_million,
            output_price_per_million: value.output_price_per_million,
            input_cached_price_per_million: value.input_cached_price_per_million,
            additional_prices: serde_json::from_value(value.additional_prices).unwrap(),
        }
    }
}

pub async fn estimate_output_cost(
    db: Arc<DB>,
    cache: Arc<Cache>,
    provider: &str,
    model: &str,
    num_tokens: i64,
) -> Option<f64> {
    let cache_key = format!("{LLM_PRICES_CACHE_KEY}:{provider}:{model}");
    let cache_res = cache.get::<LLMPriceEntry>(&cache_key).await.ok()?;

    let price_per_million_tokens = match cache_res {
        Some(price) => price.input_price_per_million,
        None => {
            let price = get_price(&db.pool, provider, model).await.ok()?;
            let price = LLMPriceEntry::from(price);
            let _ = cache
                .insert::<LLMPriceEntry>(&cache_key, price.clone())
                .await;
            price.output_price_per_million
        }
    };
    Some(calculate_cost(num_tokens, price_per_million_tokens))
}

pub async fn estimate_input_cost(
    db: Arc<DB>,
    cache: Arc<Cache>,
    provider: &str,
    model: &str,
    input_tokens: InputTokens,
) -> Option<f64> {
    let cache_key = format!("{LLM_PRICES_CACHE_KEY}:{provider}:{model}");
    // let cache_res = cache.get::<LLMPriceEntry>(&cache_key).await.ok()?;
    let cache_res = None;

    let price = match cache_res {
        Some(price) => price,
        None => {
            let price = get_price(&db.pool, provider, model).await.ok()?;
            let price = LLMPriceEntry::from(price);
            let _ = cache
                .insert::<LLMPriceEntry>(&cache_key, price.clone())
                .await;
            price
        }
    };

    let regular_input_tokens = input_tokens.regular_input_tokens;
    let cache_write_tokens = input_tokens.cache_write_tokens;
    let cache_read_tokens = input_tokens.cache_read_tokens;

    let regular_input_cost = calculate_cost(regular_input_tokens, price.input_price_per_million);
    let cache_read_cost = calculate_cost(
        cache_read_tokens,
        price.input_cached_price_per_million.unwrap_or(0.0),
    );
    let cache_write_cost = if let Some(cache_write_cost) = price
        .additional_prices
        .get("input_cache_write_price_per_million")
    {
        calculate_cost(cache_write_tokens, *cache_write_cost)
    } else {
        0.0
    };

    Some(regular_input_cost + cache_write_cost + cache_read_cost)
}

pub struct CostEntry {
    pub input_cost: f64,
    pub output_cost: f64,
}

// This is a simpler function than per-provider implementation.
// For now, we default to this, but if language model providers keep making quirky prices like
// gemini with their additional price over 128k tokens, we will have to switch to per-provider
// implementation.
pub async fn estimate_cost_by_provider_name(
    db: Arc<DB>,
    cache: Arc<Cache>,
    provider_name: &str,
    model: &str,
    input_tokens: InputTokens,
    output_tokens: i64,
) -> Option<CostEntry> {
    let input_cost = estimate_input_cost(
        db.clone(),
        cache.clone(),
        provider_name,
        model,
        input_tokens,
    )
    .await
    .or_else(|| {
        log::warn!(
            "No stored price found for provider: {}, model: {}",
            provider_name,
            model,
        );
        None
    })?;
    let output_cost = estimate_output_cost(
        db.clone(),
        cache.clone(),
        provider_name,
        model,
        output_tokens,
    )
    .await?;

    Some(CostEntry {
        input_cost,
        output_cost,
    })
}
