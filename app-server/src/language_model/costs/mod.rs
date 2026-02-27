use std::sync::Arc;

use crate::{
    cache::{Cache, CacheTrait, keys::MODEL_COSTS_CACHE_KEY},
    db::{DB, model_costs::get_model_cost},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

mod cost_calculator;
#[cfg(test)]
mod tests;

pub use cost_calculator::{CostEntry, SpanCostInput, calculate_span_cost};

const MODEL_COSTS_CACHE_TTL_SECONDS: u64 = 60 * 60 * 24; // 24 hours

/// Costs JSON blob from the `model_costs` table, cached as-is.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ModelCosts(pub Value);

/// Extract provider, region, raw model name from span attributes.
#[derive(Debug, Clone)]
pub struct ModelInfo {
    /// The full model string from gen_ai.request.model
    pub model: String,
    /// Provider from gen_ai.system or inferred from model prefix
    pub provider: Option<String>,
    /// Region from cloud.region resource attribute
    pub region: Option<String>,
    /// The model name with provider prefix stripped
    pub raw_model: String,
}

impl ModelInfo {
    pub fn extract(model: &str, provider: Option<&str>, region: Option<&str>) -> Self {
        let provider = provider.map(|p| p.to_lowercase().trim().to_string());

        // If provider is missing, try to infer from model name
        let provider = provider.or_else(|| {
            if model.contains('/') {
                model.split('/').next().map(|s| s.to_lowercase())
            } else {
                None
            }
        });

        // Extract raw model name by stripping provider prefix
        let raw_model = if model.contains('/') {
            model.splitn(2, '/').nth(1).unwrap_or(model).to_string()
        } else {
            model.to_string()
        };

        let region = region.map(|r| r.to_string());

        ModelInfo {
            model: model.to_string(),
            provider,
            region,
            raw_model,
        }
    }

    /// Generate lookup keys in priority order.
    /// Try each key in order; use the first one that matches in the DB/cache.
    pub fn lookup_keys(&self) -> Vec<String> {
        let mut keys = Vec::with_capacity(4);

        if let (Some(provider), Some(region)) = (&self.provider, &self.region) {
            // 1. provider/region/model
            keys.push(format!("{}/{}/{}", provider, region, self.model));
        }

        if let Some(provider) = &self.provider {
            // 2. provider/model
            keys.push(format!("{}/{}", provider, self.model));
        }

        // 3. model (full string as-is)
        keys.push(self.model.clone());

        // 4. raw model name (with provider prefix stripped)
        if self.raw_model != self.model {
            keys.push(self.raw_model.clone());
        }

        keys
    }
}

/// Look up model costs from cache or DB, trying keys in priority order.
pub async fn get_model_costs(
    db: Arc<DB>,
    cache: Arc<Cache>,
    model_info: &ModelInfo,
) -> Option<ModelCosts> {
    let keys = model_info.lookup_keys();

    for key in &keys {
        let cache_key = format!("{MODEL_COSTS_CACHE_KEY}:{key}");

        // Try cache first
        match cache.get::<ModelCosts>(&cache_key).await {
            Ok(Some(costs)) => return Some(costs),
            Ok(None) => {} // Cache miss, try DB
            Err(e) => {
                log::warn!("Cache error looking up model costs for key {}: {:?}", key, e);
            }
        }

        // Try DB
        match get_model_cost(&db.pool, key).await {
            Ok(Some(entry)) => {
                let costs = ModelCosts(entry.costs);
                // Store in cache for future lookups
                let _ = cache
                    .insert_with_ttl(&cache_key, costs.clone(), MODEL_COSTS_CACHE_TTL_SECONDS)
                    .await;
                return Some(costs);
            }
            Ok(None) => {} // Not found, try next key
            Err(e) => {
                log::error!("DB error looking up model costs for key {}: {:?}", key, e);
            }
        }
    }

    log::warn!(
        "No model costs found for model: {}, provider: {:?}, region: {:?}. Tried keys: {:?}",
        model_info.model,
        model_info.provider,
        model_info.region,
        keys
    );
    None
}
