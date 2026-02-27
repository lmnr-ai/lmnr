use std::sync::Arc;

use regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;

use crate::{
    cache::{Cache, CacheTrait, keys::MODEL_COSTS_CACHE_KEY},
    db::{
        DB,
        model_costs::get_model_cost,
    },
    traces::spans::InputTokens,
};

const MODEL_COSTS_CACHE_TTL_SECONDS: u64 = 60 * 60 * 24; // 24 hours

/// Regex to match threshold patterns like:
/// - `input_cost_per_token_above_200k_tokens`
/// - `input_cost_per_token_above_128000_tokens`
/// The pattern captures the numeric part (with optional k suffix).
static THRESHOLD_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^input_cost_per_token_above_(\d+k?)_tokens$").unwrap()
});

/// Result of cost calculation for a span.
pub struct CostResult {
    pub input_cost: f64,
    pub output_cost: f64,
}

/// Information extracted from span attributes for cost calculation.
pub struct SpanCostContext {
    pub provider: Option<String>,
    pub region: Option<String>,
    pub model: Option<String>,
    /// The raw model name (with provider prefix stripped)
    pub raw_model: Option<String>,
    /// Service tier (e.g., "flex", "priority")
    pub service_tier: Option<String>,
    /// Whether this is a batch request
    pub is_batch: bool,
    /// Input tokens breakdown
    pub input_tokens: InputTokens,
    /// Output tokens
    pub output_tokens: i64,
    /// Reasoning tokens from completion_tokens_details.reasoning_tokens
    pub reasoning_tokens: i64,
    /// Audio input tokens
    pub audio_input_tokens: i64,
    /// Audio output tokens
    pub audio_output_tokens: i64,
    /// Cache creation token details: ephemeral 5-minute tokens
    pub cache_creation_5m_tokens: i64,
    /// Cache creation token details: ephemeral 1-hour tokens
    pub cache_creation_1h_tokens: i64,
}

/// Parse a threshold value from a key suffix. Handles "k" suffix (e.g., "128k" -> 128000).
fn parse_threshold(s: &str) -> Option<i64> {
    if let Some(stripped) = s.strip_suffix('k') {
        stripped.parse::<i64>().ok().map(|n| n * 1000)
    } else {
        s.parse::<i64>().ok()
    }
}

/// Generate the list of lookup keys to try for model matching, in priority order.
pub fn model_lookup_keys(ctx: &SpanCostContext) -> Vec<String> {
    let mut keys = Vec::new();
    let model = match &ctx.model {
        Some(m) => m,
        None => return keys,
    };

    // 1. provider/region/model — if both provider and region are available
    if let (Some(provider), Some(region)) = (&ctx.provider, &ctx.region) {
        keys.push(format!("{}/{}/{}", provider, region, model));
    }

    // 2. provider/model — if provider is available
    if let Some(provider) = &ctx.provider {
        keys.push(format!("{}/{}", provider, model));
    }

    // 3. model — the full model string as-is
    keys.push(model.clone());

    // 4. raw model name — the model with the provider prefix stripped
    if let Some(raw) = &ctx.raw_model {
        if raw != model {
            keys.push(raw.clone());
        }
    }

    keys
}

/// Extract model, provider, region, and raw model from span attributes.
pub fn extract_model_info(
    request_model: Option<&str>,
    response_model: Option<&str>,
    provider: Option<&str>,
    region: Option<&str>,
) -> SpanCostContext {
    // Prefer response_model, fall back to request_model
    let model_str = response_model.or(request_model);

    let (provider, raw_model) = match model_str {
        Some(m) => {
            let inferred_provider = if provider.is_some() {
                provider.map(|s| s.to_string())
            } else if m.contains('/') {
                // Infer provider from model string: everything before the first /
                m.split('/').next().map(|s| s.to_string())
            } else {
                None
            };

            // Raw model name: everything after the first /
            let raw = if m.contains('/') {
                m.splitn(2, '/').nth(1).map(|s| s.to_string())
            } else {
                Some(m.to_string())
            };

            (inferred_provider, raw)
        }
        None => (provider.map(|s| s.to_string()), None),
    };

    SpanCostContext {
        provider,
        region: region.map(|s| s.to_string()),
        model: model_str.map(|s| s.to_string()),
        raw_model,
        service_tier: None,
        is_batch: false,
        input_tokens: InputTokens {
            regular_input_tokens: 0,
            cache_write_tokens: 0,
            cache_read_tokens: 0,
        },
        output_tokens: 0,
        reasoning_tokens: 0,
        audio_input_tokens: 0,
        audio_output_tokens: 0,
        cache_creation_5m_tokens: 0,
        cache_creation_1h_tokens: 0,
    }
}

/// Look up model costs from cache, falling back to the database.
/// Tries each lookup key in order, returning the first match.
pub async fn lookup_model_costs(
    db: Arc<DB>,
    cache: Arc<Cache>,
    ctx: &SpanCostContext,
) -> Option<Value> {
    let keys = model_lookup_keys(ctx);

    for key in &keys {
        let cache_key = format!("{MODEL_COSTS_CACHE_KEY}:{key}");

        // Try cache first
        match cache.get::<Value>(&cache_key).await {
            Ok(Some(costs)) => return Some(costs),
            Ok(None) => {
                // Cache miss — try database
                match get_model_cost(&db.pool, key).await {
                    Ok(Some(entry)) => {
                        let _ = cache
                            .insert_with_ttl::<Value>(
                                &cache_key,
                                entry.costs.clone(),
                                MODEL_COSTS_CACHE_TTL_SECONDS,
                            )
                            .await;
                        return Some(entry.costs);
                    }
                    Ok(None) => {
                        // This key doesn't exist; try next
                        continue;
                    }
                    Err(e) => {
                        log::error!(
                            "Error looking up model cost for key '{}': {:?}",
                            key,
                            e
                        );
                        continue;
                    }
                }
            }
            Err(e) => {
                log::warn!("Cache error for model costs key '{}': {:?}", key, e);
                // Fall through to DB lookup
                match get_model_cost(&db.pool, key).await {
                    Ok(Some(entry)) => {
                        let _ = cache
                            .insert_with_ttl::<Value>(
                                &cache_key,
                                entry.costs.clone(),
                                MODEL_COSTS_CACHE_TTL_SECONDS,
                            )
                            .await;
                        return Some(entry.costs);
                    }
                    Ok(None) => continue,
                    Err(e) => {
                        log::error!(
                            "Error looking up model cost for key '{}': {:?}",
                            key,
                            e
                        );
                        continue;
                    }
                }
            }
        }
    }

    None
}

/// Find the active threshold for token-based tiered pricing.
///
/// Looks for keys matching `input_cost_per_token_above_{N}_tokens` in the costs JSON.
/// Returns the threshold value (N) if prompt_tokens exceeds it.
/// Sorts matching thresholds descending and picks the first one where prompt_tokens > threshold.
fn find_active_threshold(costs: &Value, prompt_tokens: i64) -> Option<String> {
    let obj = costs.as_object()?;

    let mut thresholds: Vec<(i64, String)> = obj
        .keys()
        .filter_map(|key| {
            THRESHOLD_REGEX.captures(key).and_then(|caps| {
                let threshold_str = caps.get(1)?.as_str();
                let threshold_val = parse_threshold(threshold_str)?;
                Some((threshold_val, threshold_str.to_string()))
            })
        })
        .collect();

    // Sort descending by threshold value
    thresholds.sort_by(|a, b| b.0.cmp(&a.0));

    // Find the first threshold where prompt_tokens > threshold
    for (threshold_val, threshold_str) in &thresholds {
        if prompt_tokens > *threshold_val {
            return Some(threshold_str.clone());
        }
    }

    None
}

/// Get a cost value from the costs JSON, with optional tier suffix.
/// If a tier-specific key exists, use it; otherwise fall back to the base key.
fn get_cost_value(costs: &Value, base_key: &str, tier_suffix: Option<&str>) -> Option<f64> {
    if let Some(suffix) = tier_suffix {
        let tiered_key = format!("{}_{}", base_key, suffix);
        if let Some(val) = costs.get(&tiered_key).and_then(|v| v.as_f64()) {
            return Some(val);
        }
    }
    costs.get(base_key).and_then(|v| v.as_f64())
}

/// Calculate the total cost for a span given its context and the costs JSON.
pub fn calculate_cost(ctx: &SpanCostContext, costs: &Value) -> CostResult {
    let total_input_tokens = ctx.input_tokens.total();

    // Determine the active threshold based on total prompt tokens
    let active_threshold = find_active_threshold(costs, total_input_tokens);
    let threshold_suffix = active_threshold
        .as_ref()
        .map(|t| format!("above_{}_tokens", t));

    // Determine service tier suffix
    let tier_suffix = ctx.service_tier.as_deref();

    // --- INPUT COST ---

    let input_cost = if ctx.is_batch {
        // Batch pricing
        let batch_input = get_tiered_cost(
            costs,
            "input_cost_per_token_batches",
            threshold_suffix.as_deref(),
            tier_suffix,
        );
        let per_token = match batch_input {
            Some(v) => v,
            None => {
                // Fall back to default price divided by 2
                get_tiered_cost(
                    costs,
                    "input_cost_per_token",
                    threshold_suffix.as_deref(),
                    tier_suffix,
                )
                .unwrap_or(0.0)
                    / 2.0
            }
        };
        total_input_tokens as f64 * per_token
    } else {
        // Regular input tokens
        let regular_input_per_token = get_tiered_cost(
            costs,
            "input_cost_per_token",
            threshold_suffix.as_deref(),
            tier_suffix,
        )
        .unwrap_or(0.0);

        let regular_input_cost =
            ctx.input_tokens.regular_input_tokens as f64 * regular_input_per_token;

        // Cache read tokens
        let cache_read_per_token = get_tiered_cost(
            costs,
            "cache_read_input_token_cost",
            threshold_suffix.as_deref(),
            tier_suffix,
        )
        .unwrap_or(0.0);
        let cache_read_cost = ctx.input_tokens.cache_read_tokens as f64 * cache_read_per_token;

        // Cache creation tokens
        let cache_creation_cost = if ctx.cache_creation_5m_tokens > 0
            || ctx.cache_creation_1h_tokens > 0
        {
            // Handle separate 5m and 1h cache creation pricing
            let cache_5m_per_token = get_tiered_cost(
                costs,
                "cache_creation_input_token_cost",
                threshold_suffix.as_deref(),
                tier_suffix,
            )
            .unwrap_or(0.0);

            let cache_1h_per_token = get_tiered_cost(
                costs,
                "cache_creation_input_token_cost_above_1hr",
                threshold_suffix.as_deref(),
                None, // 1hr pricing doesn't have tier suffixes
            )
            .unwrap_or(cache_5m_per_token); // fall back to regular cache creation cost

            ctx.cache_creation_5m_tokens as f64 * cache_5m_per_token
                + ctx.cache_creation_1h_tokens as f64 * cache_1h_per_token
        } else {
            // Standard cache creation tokens (no 5m/1h breakdown)
            let cache_creation_per_token = get_tiered_cost(
                costs,
                "cache_creation_input_token_cost",
                threshold_suffix.as_deref(),
                tier_suffix,
            )
            .unwrap_or(0.0);
            ctx.input_tokens.cache_write_tokens as f64 * cache_creation_per_token
        };

        // Audio input tokens
        let audio_input_cost = if ctx.audio_input_tokens > 0 {
            let audio_per_token = get_cost_value(costs, "input_cost_per_audio_token", None)
                .unwrap_or(regular_input_per_token);
            ctx.audio_input_tokens as f64 * audio_per_token
        } else {
            0.0
        };

        regular_input_cost + cache_read_cost + cache_creation_cost + audio_input_cost
    };

    // --- OUTPUT COST ---

    let output_cost = if ctx.is_batch {
        // Batch pricing
        let batch_output = get_tiered_cost(
            costs,
            "output_cost_per_token_batches",
            threshold_suffix.as_deref(),
            tier_suffix,
        );
        let per_token = match batch_output {
            Some(v) => v,
            None => {
                get_tiered_cost(
                    costs,
                    "output_cost_per_token",
                    threshold_suffix.as_deref(),
                    tier_suffix,
                )
                .unwrap_or(0.0)
                    / 2.0
            }
        };
        ctx.output_tokens as f64 * per_token
    } else {
        let output_per_token = get_tiered_cost(
            costs,
            "output_cost_per_token",
            threshold_suffix.as_deref(),
            tier_suffix,
        )
        .unwrap_or(0.0);

        // Regular output tokens (excluding reasoning tokens)
        let regular_output_tokens = (ctx.output_tokens - ctx.reasoning_tokens).max(0);
        let regular_output_cost = regular_output_tokens as f64 * output_per_token;

        // Reasoning tokens
        let reasoning_cost = if ctx.reasoning_tokens > 0 {
            let reasoning_per_token =
                get_cost_value(costs, "output_cost_per_reasoning_token", None)
                    .unwrap_or(output_per_token);
            ctx.reasoning_tokens as f64 * reasoning_per_token
        } else {
            0.0
        };

        // Audio output tokens
        let audio_output_cost = if ctx.audio_output_tokens > 0 {
            let audio_per_token = get_cost_value(costs, "output_cost_per_audio_token", None)
                .unwrap_or(output_per_token);
            ctx.audio_output_tokens as f64 * audio_per_token
        } else {
            0.0
        };

        regular_output_cost + reasoning_cost + audio_output_cost
    };

    CostResult {
        input_cost,
        output_cost,
    }
}

/// Get a cost value with threshold and tier handling.
///
/// The lookup priority is:
/// 1. `{base_key}_{threshold_suffix}_{tier_suffix}` (e.g., `input_cost_per_token_above_200k_tokens_priority`)
/// 2. `{base_key}_{threshold_suffix}` (e.g., `input_cost_per_token_above_200k_tokens`)
/// 3. `{base_key}_{tier_suffix}` (e.g., `input_cost_per_token_priority`)
/// 4. `{base_key}` (e.g., `input_cost_per_token`)
fn get_tiered_cost(
    costs: &Value,
    base_key: &str,
    threshold_suffix: Option<&str>,
    tier_suffix: Option<&str>,
) -> Option<f64> {
    // Try threshold + tier combination first
    if let (Some(threshold), Some(tier)) = (threshold_suffix, tier_suffix) {
        let key = format!("{}_{}_{}", base_key, threshold, tier);
        if let Some(val) = costs.get(&key).and_then(|v| v.as_f64()) {
            return Some(val);
        }
    }

    // Try threshold only
    if let Some(threshold) = threshold_suffix {
        let key = format!("{}_{}", base_key, threshold);
        if let Some(val) = costs.get(&key).and_then(|v| v.as_f64()) {
            return Some(val);
        }
    }

    // Try tier only
    if let Some(tier) = tier_suffix {
        let key = format!("{}_{}", base_key, tier);
        if let Some(val) = costs.get(&key).and_then(|v| v.as_f64()) {
            return Some(val);
        }
    }

    // Base key
    costs.get(base_key).and_then(|v| v.as_f64())
}

/// High-level function: look up costs and calculate for a span.
pub async fn estimate_span_cost(
    db: Arc<DB>,
    cache: Arc<Cache>,
    ctx: &SpanCostContext,
) -> Option<CostResult> {
    let costs = lookup_model_costs(db, cache, ctx).await?;
    Some(calculate_cost(ctx, &costs))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_ctx(
        input_tokens: i64,
        output_tokens: i64,
        cache_write: i64,
        cache_read: i64,
    ) -> SpanCostContext {
        SpanCostContext {
            provider: Some("anthropic".to_string()),
            region: None,
            model: Some("claude-sonnet-4-5".to_string()),
            raw_model: Some("claude-sonnet-4-5".to_string()),
            service_tier: None,
            is_batch: false,
            input_tokens: InputTokens {
                regular_input_tokens: input_tokens - cache_write - cache_read,
                cache_write_tokens: cache_write,
                cache_read_tokens: cache_read,
            },
            output_tokens,
            reasoning_tokens: 0,
            audio_input_tokens: 0,
            audio_output_tokens: 0,
            cache_creation_5m_tokens: 0,
            cache_creation_1h_tokens: 0,
        }
    }

    #[test]
    fn test_basic_cost_calculation() {
        let costs = json!({
            "input_cost_per_token": 3e-06,
            "output_cost_per_token": 1.5e-05,
        });

        let ctx = make_ctx(1000, 500, 0, 0);
        let result = calculate_cost(&ctx, &costs);

        assert!((result.input_cost - 0.003).abs() < 1e-10);
        assert!((result.output_cost - 0.0075).abs() < 1e-10);
    }

    #[test]
    fn test_cache_token_pricing() {
        let costs = json!({
            "input_cost_per_token": 3e-06,
            "output_cost_per_token": 1.5e-05,
            "cache_read_input_token_cost": 3e-07,
            "cache_creation_input_token_cost": 3.75e-06,
        });

        let ctx = make_ctx(1000, 500, 200, 300);
        // regular_input_tokens = 1000 - 200 - 300 = 500
        let result = calculate_cost(&ctx, &costs);

        let expected_input = 500.0 * 3e-06  // regular
            + 300.0 * 3e-07               // cache read
            + 200.0 * 3.75e-06;           // cache creation
        assert!(
            (result.input_cost - expected_input).abs() < 1e-10,
            "input_cost: {} != expected: {}",
            result.input_cost,
            expected_input
        );
    }

    #[test]
    fn test_threshold_pricing() {
        let costs = json!({
            "input_cost_per_token": 3e-06,
            "output_cost_per_token": 1.5e-05,
            "input_cost_per_token_above_200k_tokens": 6e-06,
            "output_cost_per_token_above_200k_tokens": 2.25e-05,
        });

        // Below threshold
        let ctx = make_ctx(100_000, 500, 0, 0);
        let result = calculate_cost(&ctx, &costs);
        assert!((result.input_cost - 100_000.0 * 3e-06).abs() < 1e-10);

        // Above threshold (200k = 200_000)
        let ctx = make_ctx(250_000, 500, 0, 0);
        let result = calculate_cost(&ctx, &costs);
        // Threshold pricing applies to ENTIRE message
        assert!((result.input_cost - 250_000.0 * 6e-06).abs() < 1e-10);
        assert!((result.output_cost - 500.0 * 2.25e-05).abs() < 1e-10);
    }

    #[test]
    fn test_threshold_with_k_suffix() {
        let costs = json!({
            "input_cost_per_token": 0.000000075,
            "output_cost_per_token": 0.0000003,
            "input_cost_per_token_above_128k_tokens": 0.000001,
            "output_cost_per_token_above_128k_tokens": 0.0000006,
        });

        // Below 128k
        let ctx = make_ctx(100_000, 500, 0, 0);
        let result = calculate_cost(&ctx, &costs);
        assert!((result.input_cost - 100_000.0 * 0.000000075).abs() < 1e-10);

        // Above 128k (128000)
        let ctx = make_ctx(200_000, 500, 0, 0);
        let result = calculate_cost(&ctx, &costs);
        assert!((result.input_cost - 200_000.0 * 0.000001).abs() < 1e-10);
        assert!((result.output_cost - 500.0 * 0.0000006).abs() < 1e-10);
    }

    #[test]
    fn test_multiple_thresholds_picks_highest() {
        let costs = json!({
            "input_cost_per_token": 1e-06,
            "output_cost_per_token": 5e-06,
            "input_cost_per_token_above_128k_tokens": 2e-06,
            "output_cost_per_token_above_128k_tokens": 10e-06,
            "input_cost_per_token_above_200k_tokens": 4e-06,
            "output_cost_per_token_above_200k_tokens": 20e-06,
        });

        // Above 200k - should use 200k pricing (highest threshold)
        let ctx = make_ctx(250_000, 500, 0, 0);
        let result = calculate_cost(&ctx, &costs);
        assert!((result.input_cost - 250_000.0 * 4e-06).abs() < 1e-10);

        // Between 128k and 200k - should use 128k pricing
        let ctx = make_ctx(150_000, 500, 0, 0);
        let result = calculate_cost(&ctx, &costs);
        assert!((result.input_cost - 150_000.0 * 2e-06).abs() < 1e-10);
    }

    #[test]
    fn test_service_tier_pricing() {
        let costs = json!({
            "input_cost_per_token": 0.00000125,
            "output_cost_per_token": 0.00001,
            "input_cost_per_token_flex": 0.000000625,
            "output_cost_per_token_flex": 0.000005,
            "input_cost_per_token_priority": 0.0000025,
            "output_cost_per_token_priority": 0.00002,
        });

        // Flex tier
        let mut ctx = make_ctx(1000, 500, 0, 0);
        ctx.service_tier = Some("flex".to_string());
        let result = calculate_cost(&ctx, &costs);
        assert!((result.input_cost - 1000.0 * 0.000000625).abs() < 1e-10);
        assert!((result.output_cost - 500.0 * 0.000005).abs() < 1e-10);

        // Priority tier
        ctx.service_tier = Some("priority".to_string());
        let result = calculate_cost(&ctx, &costs);
        assert!((result.input_cost - 1000.0 * 0.0000025).abs() < 1e-10);
        assert!((result.output_cost - 500.0 * 0.00002).abs() < 1e-10);
    }

    #[test]
    fn test_service_tier_fallback() {
        let costs = json!({
            "input_cost_per_token": 0.00000125,
            "output_cost_per_token": 0.00001,
            // No tier-specific keys
        });

        let mut ctx = make_ctx(1000, 500, 0, 0);
        ctx.service_tier = Some("flex".to_string());
        let result = calculate_cost(&ctx, &costs);
        // Should fall back to base pricing
        assert!((result.input_cost - 1000.0 * 0.00000125).abs() < 1e-10);
        assert!((result.output_cost - 500.0 * 0.00001).abs() < 1e-10);
    }

    #[test]
    fn test_batch_pricing() {
        let costs = json!({
            "input_cost_per_token": 0.000002,
            "output_cost_per_token": 0.000008,
            "input_cost_per_token_batches": 0.000001,
            "output_cost_per_token_batches": 0.000004,
        });

        let mut ctx = make_ctx(1000, 500, 0, 0);
        ctx.is_batch = true;
        let result = calculate_cost(&ctx, &costs);
        assert!((result.input_cost - 1000.0 * 0.000001).abs() < 1e-10);
        assert!((result.output_cost - 500.0 * 0.000004).abs() < 1e-10);
    }

    #[test]
    fn test_batch_pricing_fallback() {
        let costs = json!({
            "input_cost_per_token": 0.000002,
            "output_cost_per_token": 0.000008,
            // No batch-specific keys
        });

        let mut ctx = make_ctx(1000, 500, 0, 0);
        ctx.is_batch = true;
        let result = calculate_cost(&ctx, &costs);
        // Should fall back to default / 2
        assert!((result.input_cost - 1000.0 * 0.000001).abs() < 1e-10);
        assert!((result.output_cost - 500.0 * 0.000004).abs() < 1e-10);
    }

    #[test]
    fn test_reasoning_tokens() {
        let costs = json!({
            "input_cost_per_token": 3e-06,
            "output_cost_per_token": 1.5e-05,
            "output_cost_per_reasoning_token": 3e-05,
        });

        let mut ctx = make_ctx(1000, 500, 0, 0);
        ctx.reasoning_tokens = 200;
        let result = calculate_cost(&ctx, &costs);

        let expected_output = (500 - 200) as f64 * 1.5e-05 + 200.0 * 3e-05;
        assert!(
            (result.output_cost - expected_output).abs() < 1e-10,
            "output_cost: {} != expected: {}",
            result.output_cost,
            expected_output
        );
    }

    #[test]
    fn test_reasoning_tokens_fallback() {
        let costs = json!({
            "input_cost_per_token": 3e-06,
            "output_cost_per_token": 1.5e-05,
            // No output_cost_per_reasoning_token
        });

        let mut ctx = make_ctx(1000, 500, 0, 0);
        ctx.reasoning_tokens = 200;
        let result = calculate_cost(&ctx, &costs);

        // Falls back to regular output pricing
        let expected_output = 300.0 * 1.5e-05 + 200.0 * 1.5e-05;
        assert!(
            (result.output_cost - expected_output).abs() < 1e-10,
            "output_cost: {} != expected: {}",
            result.output_cost,
            expected_output
        );
    }

    #[test]
    fn test_audio_tokens() {
        let costs = json!({
            "input_cost_per_token": 3e-06,
            "output_cost_per_token": 1.5e-05,
            "input_cost_per_audio_token": 0.00011,
            "output_cost_per_audio_token": 0.00022,
        });

        let mut ctx = make_ctx(1000, 500, 0, 0);
        ctx.audio_input_tokens = 100;
        ctx.audio_output_tokens = 50;
        let result = calculate_cost(&ctx, &costs);

        let expected_input = 1000.0 * 3e-06 + 100.0 * 0.00011;
        let expected_output = 500.0 * 1.5e-05 + 50.0 * 0.00022;
        assert!(
            (result.input_cost - expected_input).abs() < 1e-10,
            "input_cost: {} != expected: {}",
            result.input_cost,
            expected_input
        );
        assert!(
            (result.output_cost - expected_output).abs() < 1e-10,
            "output_cost: {} != expected: {}",
            result.output_cost,
            expected_output
        );
    }

    #[test]
    fn test_cache_creation_5m_1h_pricing() {
        let costs = json!({
            "input_cost_per_token": 3e-06,
            "output_cost_per_token": 1.5e-05,
            "cache_creation_input_token_cost": 3.75e-06,
            "cache_creation_input_token_cost_above_1hr": 7.5e-06,
            "cache_read_input_token_cost": 3e-07,
        });

        let mut ctx = make_ctx(1000, 500, 0, 0);
        ctx.cache_creation_5m_tokens = 100;
        ctx.cache_creation_1h_tokens = 50;
        let result = calculate_cost(&ctx, &costs);

        let expected_input = 1000.0 * 3e-06 // regular
            + 100.0 * 3.75e-06               // 5m cache creation
            + 50.0 * 7.5e-06;               // 1h cache creation
        assert!(
            (result.input_cost - expected_input).abs() < 1e-10,
            "input_cost: {} != expected: {}",
            result.input_cost,
            expected_input
        );
    }

    #[test]
    fn test_model_lookup_keys() {
        let ctx = SpanCostContext {
            provider: Some("bedrock".to_string()),
            region: Some("us-east-1".to_string()),
            model: Some("anthropic.claude-v2".to_string()),
            raw_model: Some("anthropic.claude-v2".to_string()),
            service_tier: None,
            is_batch: false,
            input_tokens: InputTokens {
                regular_input_tokens: 0,
                cache_write_tokens: 0,
                cache_read_tokens: 0,
            },
            output_tokens: 0,
            reasoning_tokens: 0,
            audio_input_tokens: 0,
            audio_output_tokens: 0,
            cache_creation_5m_tokens: 0,
            cache_creation_1h_tokens: 0,
        };

        let keys = model_lookup_keys(&ctx);
        assert_eq!(keys.len(), 3);
        assert_eq!(keys[0], "bedrock/us-east-1/anthropic.claude-v2");
        assert_eq!(keys[1], "bedrock/anthropic.claude-v2");
        assert_eq!(keys[2], "anthropic.claude-v2");
    }

    #[test]
    fn test_model_lookup_keys_with_slash_in_model() {
        let ctx = SpanCostContext {
            provider: Some("bedrock".to_string()),
            region: Some("us-east-1".to_string()),
            model: Some("bedrock/us-east-1/anthropic.claude-v2".to_string()),
            raw_model: Some("us-east-1/anthropic.claude-v2".to_string()),
            service_tier: None,
            is_batch: false,
            input_tokens: InputTokens {
                regular_input_tokens: 0,
                cache_write_tokens: 0,
                cache_read_tokens: 0,
            },
            output_tokens: 0,
            reasoning_tokens: 0,
            audio_input_tokens: 0,
            audio_output_tokens: 0,
            cache_creation_5m_tokens: 0,
            cache_creation_1h_tokens: 0,
        };

        let keys = model_lookup_keys(&ctx);
        assert_eq!(
            keys[0],
            "bedrock/us-east-1/bedrock/us-east-1/anthropic.claude-v2"
        );
        assert_eq!(keys[1], "bedrock/bedrock/us-east-1/anthropic.claude-v2");
        assert_eq!(keys[2], "bedrock/us-east-1/anthropic.claude-v2");
        assert_eq!(keys[3], "us-east-1/anthropic.claude-v2");
    }

    #[test]
    fn test_model_lookup_keys_no_provider() {
        let ctx = SpanCostContext {
            provider: None,
            region: None,
            model: Some("claude-sonnet-4-5".to_string()),
            raw_model: Some("claude-sonnet-4-5".to_string()),
            service_tier: None,
            is_batch: false,
            input_tokens: InputTokens {
                regular_input_tokens: 0,
                cache_write_tokens: 0,
                cache_read_tokens: 0,
            },
            output_tokens: 0,
            reasoning_tokens: 0,
            audio_input_tokens: 0,
            audio_output_tokens: 0,
            cache_creation_5m_tokens: 0,
            cache_creation_1h_tokens: 0,
        };

        let keys = model_lookup_keys(&ctx);
        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0], "claude-sonnet-4-5");
    }

    #[test]
    fn test_extract_model_info_with_slash() {
        let ctx = extract_model_info(
            Some("anthropic/claude-sonnet-4-5"),
            None,
            None,
            None,
        );
        assert_eq!(ctx.provider.as_deref(), Some("anthropic"));
        assert_eq!(ctx.model.as_deref(), Some("anthropic/claude-sonnet-4-5"));
        assert_eq!(ctx.raw_model.as_deref(), Some("claude-sonnet-4-5"));
    }

    #[test]
    fn test_extract_model_info_no_slash() {
        let ctx = extract_model_info(
            Some("claude-sonnet-4-5"),
            None,
            Some("anthropic"),
            None,
        );
        assert_eq!(ctx.provider.as_deref(), Some("anthropic"));
        assert_eq!(ctx.model.as_deref(), Some("claude-sonnet-4-5"));
        assert_eq!(ctx.raw_model.as_deref(), Some("claude-sonnet-4-5"));
    }

    #[test]
    fn test_extract_model_info_provider_from_gen_ai_system() {
        let ctx = extract_model_info(
            Some("claude-sonnet-4-5"),
            Some("claude-sonnet-4-5-20250514"),
            Some("anthropic"),
            Some("us-east-1"),
        );
        assert_eq!(ctx.provider.as_deref(), Some("anthropic"));
        assert_eq!(
            ctx.model.as_deref(),
            Some("claude-sonnet-4-5-20250514")
        );
        assert_eq!(
            ctx.raw_model.as_deref(),
            Some("claude-sonnet-4-5-20250514")
        );
        assert_eq!(ctx.region.as_deref(), Some("us-east-1"));
    }

    #[test]
    fn test_threshold_pricing_with_cache_and_threshold() {
        let costs = json!({
            "input_cost_per_token": 3e-06,
            "output_cost_per_token": 1.5e-05,
            "cache_read_input_token_cost": 3e-07,
            "cache_creation_input_token_cost": 3.75e-06,
            "input_cost_per_token_above_200k_tokens": 6e-06,
            "output_cost_per_token_above_200k_tokens": 2.25e-05,
            "cache_read_input_token_cost_above_200k_tokens": 6e-07,
            "cache_creation_input_token_cost_above_200k_tokens": 7.5e-06,
        });

        // Total tokens above 200k threshold
        let ctx = make_ctx(250_000, 500, 10_000, 20_000);
        let result = calculate_cost(&ctx, &costs);

        // regular_input_tokens = 250_000 - 10_000 - 20_000 = 220_000
        let expected_input = 220_000.0 * 6e-06  // regular (threshold pricing)
            + 20_000.0 * 6e-07                  // cache read (threshold pricing)
            + 10_000.0 * 7.5e-06;              // cache creation (threshold pricing)
        assert!(
            (result.input_cost - expected_input).abs() < 1e-10,
            "input_cost: {} != expected: {}",
            result.input_cost,
            expected_input
        );

        let expected_output = 500.0 * 2.25e-05; // output (threshold pricing)
        assert!(
            (result.output_cost - expected_output).abs() < 1e-10,
            "output_cost: {} != expected: {}",
            result.output_cost,
            expected_output
        );
    }

    #[test]
    fn test_combined_service_tier_and_threshold() {
        let costs = json!({
            "input_cost_per_token": 0.00000125,
            "output_cost_per_token": 0.00001,
            "input_cost_per_token_priority": 0.0000025,
            "output_cost_per_token_priority": 0.00002,
            "input_cost_per_token_above_200k_tokens": 0.0000025,
            "output_cost_per_token_above_200k_tokens": 0.00002,
            "input_cost_per_token_above_200k_tokens_priority": 0.000005,
            "output_cost_per_token_above_200k_tokens_priority": 0.00004,
        });

        let mut ctx = make_ctx(250_000, 500, 0, 0);
        ctx.service_tier = Some("priority".to_string());
        let result = calculate_cost(&ctx, &costs);

        // Should use threshold + priority combined pricing
        assert!(
            (result.input_cost - 250_000.0 * 0.000005).abs() < 1e-10,
            "input_cost: {} != expected: {}",
            result.input_cost,
            250_000.0 * 0.000005
        );
        assert!(
            (result.output_cost - 500.0 * 0.00004).abs() < 1e-10,
            "output_cost: {} != expected: {}",
            result.output_cost,
            500.0 * 0.00004
        );
    }

    #[test]
    fn test_zero_tokens() {
        let costs = json!({
            "input_cost_per_token": 3e-06,
            "output_cost_per_token": 1.5e-05,
        });

        let ctx = make_ctx(0, 0, 0, 0);
        let result = calculate_cost(&ctx, &costs);
        assert!((result.input_cost).abs() < 1e-10);
        assert!((result.output_cost).abs() < 1e-10);
    }

    #[test]
    fn test_missing_cost_fields() {
        // Costs JSON with no pricing fields (e.g., image-generation-only model)
        let costs = json!({
            "mode": "image_generation",
            "output_cost_per_image": 0.06,
        });

        let ctx = make_ctx(1000, 500, 0, 0);
        let result = calculate_cost(&ctx, &costs);
        // Should gracefully return 0 for both
        assert!((result.input_cost).abs() < 1e-10);
        assert!((result.output_cost).abs() < 1e-10);
    }

    #[test]
    fn test_parse_threshold() {
        assert_eq!(parse_threshold("128k"), Some(128000));
        assert_eq!(parse_threshold("200k"), Some(200000));
        assert_eq!(parse_threshold("128000"), Some(128000));
        assert_eq!(parse_threshold("256k"), Some(256000));
        assert_eq!(parse_threshold("abc"), None);
    }
}
