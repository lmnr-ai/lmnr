use std::{collections::HashMap, sync::Arc};

use crate::{
    cache::Cache,
    db::{
        prices::{get_price, DBPriceEntry},
        DB,
    },
};

use super::providers::utils::calculate_cost;

pub enum TokensKind {
    Input,
    Output,
}

#[derive(Clone)]
pub struct LLMPriceEntry {
    _provider: String,
    _model: String,
    input_price_per_million: f64,
    output_price_per_million: f64,
    _input_cached_price_per_million: Option<f64>,
    _additional_prices: HashMap<String, f64>,
}

impl LLMPriceEntry {
    pub fn get_price(&self, kind: TokensKind) -> Option<f64> {
        match kind {
            TokensKind::Input => Some(self.input_price_per_million),
            TokensKind::Output => Some(self.output_price_per_million),
        }
    }
}

impl From<DBPriceEntry> for LLMPriceEntry {
    fn from(value: DBPriceEntry) -> Self {
        Self {
            _provider: value.provider,
            _model: value.model,
            input_price_per_million: value.input_price_per_million,
            output_price_per_million: value.output_price_per_million,
            _input_cached_price_per_million: value.input_cached_price_per_million,
            _additional_prices: serde_json::from_value(value.additional_prices).unwrap(),
        }
    }
}

pub async fn estimate_cost(
    db: Arc<DB>,
    cache: Arc<Cache>,
    provider: &str,
    model: &str,
    num_tokens: u32,
    tokens_kind: TokensKind,
) -> Option<f64> {
    let cache_res = cache
        .get::<LLMPriceEntry>(&format!("{}:{}", provider, model))
        .await
        .ok()?;
    let price_per_million_tokens = match cache_res {
        Some(price) => price.input_price_per_million,
        None => {
            let price = get_price(&db.pool, provider, model).await.ok()?;
            let price = LLMPriceEntry::from(price);
            let _ = cache
                .insert::<LLMPriceEntry>(format!("{}:{}", provider, model), &price)
                .await;
            price.get_price(tokens_kind)?
        }
    };
    Some(calculate_cost(num_tokens, price_per_million_tokens))
}
