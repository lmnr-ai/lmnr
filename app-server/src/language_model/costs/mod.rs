use std::sync::{Arc, LazyLock};

use regex::Regex;

use crate::{
    cache::{Cache, CacheTrait, keys::MODEL_COSTS_CACHE_KEY},
    db::{DB, model_costs::get_model_costs_batch},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Matches date snapshot suffixes: `-2025-04-14` (OpenAI) or `-20250514` (Anthropic)
static SNAPSHOT_SUFFIX_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"-\d{4}-?\d{2}-?\d{2}$").unwrap());

mod cost_calculator;
#[cfg(test)]
mod tests;

pub use cost_calculator::{SpanCostInput, calculate_span_cost};

const MODEL_COSTS_CACHE_TTL_SECONDS: u64 = 60 * 60 * 24; // 24 hours
const MODEL_COSTS_NEGATIVE_CACHE_TTL_SECONDS: u64 = 60 * 30; // 30 minutes

/// Costs JSON blob from the `model_costs` table, cached as-is.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ModelCosts(pub Value);

/// Extract provider and raw model name from span attributes.
#[derive(Debug, Clone)]
pub struct ModelInfo {
    /// The full model string from gen_ai.request.model
    pub model: String,
    /// Provider from gen_ai.system or inferred from model prefix
    pub provider: Option<String>,
    /// The model name with provider prefix stripped
    pub raw_model: String,
    /// The raw model name with date snapshot suffix stripped
    /// (e.g. `gpt-4.1-nano-2025-04-14` → `gpt-4.1-nano`)
    pub model_without_snapshot: String,
    /// The model name with dots replaced by dashes
    /// (e.g. `gpt-4.1-nano` → `gpt-4-1-nano`)
    pub model_without_dots: String,
}

impl ModelInfo {
    /// Canonical cache key derived from normalized fields.
    /// Deterministic regardless of whether provider was explicit or inferred from model prefix.
    pub fn cache_key(&self) -> String {
        format!(
            "{}:{}:{}",
            MODEL_COSTS_CACHE_KEY,
            self.provider.as_deref().unwrap_or(""),
            self.raw_model,
        )
    }

    pub fn extract(model: &str, provider: Option<&str>) -> Self {
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

        // Extract model name without date snapshot suffix
        let model_without_snapshot = SNAPSHOT_SUFFIX_REGEX.replace(&raw_model, "").into_owned();

        let model_without_dots = model_without_snapshot.replace('.', "-");

        ModelInfo {
            model: model.to_string(),
            provider,
            raw_model,
            model_without_snapshot,
            model_without_dots,
        }
    }

    /// Generate lookup keys in priority order.
    /// Try each key in order; use the first one that matches in the DB/cache.
    pub fn lookup_keys(&self) -> Vec<String> {
        let mut keys = Vec::new();

        if let Some(provider) = &self.provider {
            // 1. provider/model
            keys.push(format!("{}/{}", provider, self.raw_model));
            keys.push(format!("{}/{}", provider, self.model));
            keys.push(format!("{}/{}", provider, self.model_without_snapshot));
            keys.push(format!("{}/{}", provider, self.model_without_dots));
        }

        // 2. model (full string as-is)
        keys.push(self.model.clone());

        // 3. raw model name (with provider prefix stripped)
        keys.push(self.raw_model.clone());

        // 4. raw model name without date snapshot suffix
        keys.push(self.model_without_snapshot.clone());

        // 5. raw model name without dots
        keys.push(self.model_without_dots.clone());

        // dedup keys
        let mut seen = Vec::with_capacity(keys.len());
        for key in keys {
            if !seen.contains(&key) {
                seen.push(key);
            }
        }
        seen
    }
}

/// Look up model costs from cache or DB, trying lookup keys in priority order.
///
/// Uses a single canonical cache key derived from the normalized ModelInfo fields,
/// so all equivalent model strings share one cache entry.
pub async fn get_model_costs(
    db: Arc<DB>,
    cache: Arc<Cache>,
    model_info: &ModelInfo,
) -> Option<ModelCosts> {
    log::debug!(
        "Getting model costs for model: {}, provider: {:?}",
        model_info.model,
        model_info.provider,
    );

    let cache_key = model_info.cache_key();

    // Check canonical cache key
    match cache.get::<Option<ModelCosts>>(&cache_key).await {
        Ok(Some(maybe_costs)) => {
            return maybe_costs;
        }
        Ok(None) => {} // Cache miss, query DB
        Err(e) => {
            log::warn!(
                "Cache error looking up model costs for {}: {:?}",
                cache_key,
                e
            );
        }
    }

    // Generate lookup keys and batch-query DB
    let keys = model_info.lookup_keys();
    let db_results = match get_model_costs_batch(&db.pool, &keys).await {
        Ok(results) => results,
        Err(e) => {
            log::error!(
                "DB error batch-looking up model costs for keys {:?}: {:?}",
                keys,
                e
            );
            return None;
        }
    };

    // Pick the highest-priority match
    let result = keys
        .iter()
        .find_map(|key| db_results.get(key))
        .map(|entry| ModelCosts(entry.costs.clone()));

    // Cache hit (24h) or negative (30min) under the canonical key
    if result.is_some() {
        log::debug!("Found costs in DB for model: {}", model_info.model);
        let _ = cache
            .insert_with_ttl(&cache_key, &result, MODEL_COSTS_CACHE_TTL_SECONDS)
            .await;
    } else {
        log::warn!(
            "No model costs found for model: {}, provider: {:?}. Tried keys: {:?}",
            model_info.model,
            model_info.provider,
            keys
        );
        let _ = cache
            .insert_with_ttl::<Option<ModelCosts>>(
                &cache_key,
                None,
                MODEL_COSTS_NEGATIVE_CACHE_TTL_SECONDS,
            )
            .await;
    }

    result
}
