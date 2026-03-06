use std::sync::{Arc, LazyLock};

use regex::Regex;

use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{CUSTOM_MODEL_COSTS_CACHE_KEY, MODEL_COSTS_CACHE_KEY},
    },
    db::{
        DB,
        custom_model_costs::get_custom_model_costs_batch,
        model_costs::get_model_costs_batch,
    },
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

    /// Cache key for project-specific custom model costs.
    pub fn custom_cache_key(&self, project_id: &Uuid) -> String {
        format!(
            "{}:{}:{}:{}",
            CUSTOM_MODEL_COSTS_CACHE_KEY,
            project_id,
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

/// Look up custom model costs for a specific project, then fall back to universal costs.
///
/// Priority:
/// 1. Project-specific custom model costs (cache → DB)
/// 2. Universal model costs (cache → DB)
pub async fn get_model_costs_for_project(
    db: Arc<DB>,
    cache: Arc<Cache>,
    model_info: &ModelInfo,
    project_id: &Uuid,
) -> Option<ModelCosts> {
    // First try project-specific custom model costs
    if let Some(costs) = get_custom_model_costs(db.clone(), cache.clone(), model_info, project_id).await {
        return Some(costs);
    }

    // Fall back to universal model costs
    get_model_costs(db, cache, model_info).await
}

/// Look up custom model costs for a project from cache or DB.
async fn get_custom_model_costs(
    db: Arc<DB>,
    cache: Arc<Cache>,
    model_info: &ModelInfo,
    project_id: &Uuid,
) -> Option<ModelCosts> {
    let cache_key = model_info.custom_cache_key(project_id);

    // Check cache first
    match cache.get::<Option<ModelCosts>>(&cache_key).await {
        Ok(Some(maybe_costs)) => {
            return maybe_costs;
        }
        Ok(None) => {} // Cache miss
        Err(e) => {
            log::warn!(
                "Cache error looking up custom model costs for {}: {:?}",
                cache_key,
                e
            );
        }
    }

    // Generate lookup keys and batch-query DB
    let keys = model_info.lookup_keys();
    let db_results = match get_custom_model_costs_batch(&db.pool, project_id, &keys).await {
        Ok(results) => results,
        Err(e) => {
            log::error!(
                "DB error looking up custom model costs for project {}, keys {:?}: {:?}",
                project_id,
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

    // Cache the result
    if result.is_some() {
        log::debug!(
            "Found custom costs in DB for model: {}, project: {}",
            model_info.model,
            project_id
        );
        let _ = cache
            .insert_with_ttl(&cache_key, result.clone(), MODEL_COSTS_CACHE_TTL_SECONDS)
            .await;
    } else {
        // Negative cache for custom costs is shorter so new custom costs take effect faster
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
            .insert_with_ttl(&cache_key, result.clone(), MODEL_COSTS_CACHE_TTL_SECONDS)
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

/// Invalidate custom model cost cache entries for a project.
/// Called after upsert/delete operations on custom model costs.
///
/// Because the same underlying model can be cached under different keys
/// depending on how the span's model/provider attributes arrive (e.g.
/// with provider, without provider, with provider prefix in model string),
/// we remove all possible cache key variants rather than just one.
pub async fn invalidate_custom_model_costs_cache(
    cache: Arc<Cache>,
    project_id: &Uuid,
    model: &str,
    provider: Option<&str>,
) {
    let model_info = ModelInfo::extract(model, provider);

    // Collect all distinct cache keys that could have been generated for this model.
    // A span can arrive with or without a provider, or with the provider baked into
    // the model string (e.g. "openai/gpt-4o"), producing different ModelInfo values
    // and therefore different cache keys.
    let mut keys_to_remove = Vec::new();

    // 1. Key for the canonical extraction (as given)
    keys_to_remove.push(model_info.custom_cache_key(project_id));

    // 2. Key for the no-provider variant (span arrives without provider)
    let no_provider_info = ModelInfo::extract(model, None);
    keys_to_remove.push(no_provider_info.custom_cache_key(project_id));

    // 3. If provider is known, also try with provider baked into model string
    if let Some(provider) = provider {
        let prefixed_model = format!("{}/{}", provider, model);
        let prefixed_info = ModelInfo::extract(&prefixed_model, None);
        keys_to_remove.push(prefixed_info.custom_cache_key(project_id));

        let prefixed_with_provider = ModelInfo::extract(&prefixed_model, Some(provider));
        keys_to_remove.push(prefixed_with_provider.custom_cache_key(project_id));
    }

    // 4. If the model itself contains a provider prefix, also try the bare model name
    if let Some(pos) = model.find('/') {
        let bare_model = &model[pos + 1..];
        let inferred_provider = &model[..pos];

        let bare_no_provider = ModelInfo::extract(bare_model, None);
        keys_to_remove.push(bare_no_provider.custom_cache_key(project_id));

        let bare_with_provider = ModelInfo::extract(bare_model, Some(inferred_provider));
        keys_to_remove.push(bare_with_provider.custom_cache_key(project_id));
    }

    // Dedup and remove all
    keys_to_remove.sort();
    keys_to_remove.dedup();
    for key in &keys_to_remove {
        let _ = cache.remove(key).await;
    }
}
