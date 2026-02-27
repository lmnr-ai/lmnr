use regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;

use super::ModelCosts;

/// Result of cost calculation for a span
#[derive(Debug, Clone, Default)]
pub struct CostEntry {
    pub input_cost: f64,
    pub output_cost: f64,
}

/// All token and attribute info extracted from a span, needed for cost calculation.
#[derive(Debug, Clone, Default)]
pub struct SpanCostInput {
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_creation_tokens: i64,
    /// 5-minute ephemeral cache creation tokens
    pub cache_creation_5m_tokens: i64,
    /// 1-hour ephemeral cache creation tokens
    pub cache_creation_1h_tokens: i64,
    pub audio_input_tokens: i64,
    pub audio_output_tokens: i64,
    pub reasoning_tokens: i64,
    /// Service tier: "flex", "priority", or None
    pub service_tier: Option<String>,
    /// Whether this is a batch request
    pub is_batch: bool,
}

/// Regex to match threshold fields like `input_cost_per_token_above_200k_tokens`
/// or `input_cost_per_token_above_128000_tokens`
static THRESHOLD_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^input_cost_per_token_above_((\d+)(k?))_tokens$").unwrap()
});

/// Parse a threshold numeric value from a suffix like "200k" or "128000"
fn parse_threshold_value(number_str: &str, has_k_suffix: bool) -> Option<i64> {
    let n: i64 = number_str.parse().ok()?;
    if has_k_suffix { Some(n * 1000) } else { Some(n) }
}

/// A matched threshold with its original suffix string and numeric value
struct ThresholdMatch {
    /// The original suffix string exactly as it appears in the key (e.g. "200k", "128000")
    suffix: String,
    /// The numeric threshold value in tokens
    value: i64,
}

/// Find the applicable token threshold for a given prompt token count.
///
/// Scans the costs JSON for keys matching `input_cost_per_token_above_{N}_tokens`
/// and returns the highest threshold that is exceeded by prompt_tokens,
/// preserving the exact suffix string from the key.
fn find_applicable_threshold(costs: &Value, prompt_tokens: i64) -> Option<ThresholdMatch> {
    let obj = costs.as_object()?;

    let mut matches: Vec<ThresholdMatch> = obj
        .keys()
        .filter_map(|key| {
            let caps = THRESHOLD_REGEX.captures(key)?;
            let full_suffix = caps.get(1)?.as_str().to_string();
            let number_str = caps.get(2)?.as_str();
            let has_k = caps.get(3).is_some_and(|m| !m.as_str().is_empty());
            let value = parse_threshold_value(number_str, has_k)?;
            if prompt_tokens > value {
                Some(ThresholdMatch {
                    suffix: full_suffix,
                    value,
                })
            } else {
                None
            }
        })
        .collect();

    // Sort by value descending - pick the highest exceeded threshold
    matches.sort_unstable_by(|a, b| b.value.cmp(&a.value));
    matches.into_iter().next()
}

/// Get a f64 cost value from the costs JSON by key name
fn get_cost(costs: &Value, key: &str) -> Option<f64> {
    costs.get(key).and_then(|v| v.as_f64())
}

/// Resolve a cost key, trying tier-specific first if applicable, then fallback.
/// If service_tier is Some("flex"), tries `{base_key}_flex` first.
fn resolve_cost_key(costs: &Value, base_key: &str, service_tier: Option<&str>) -> Option<f64> {
    if let Some(tier) = service_tier {
        let tier_key = format!("{}_{}", base_key, tier);
        if let Some(val) = get_cost(costs, &tier_key) {
            return Some(val);
        }
    }
    get_cost(costs, base_key)
}

/// Calculate cost for a span given the costs JSON and span input tokens/attributes.
pub fn calculate_span_cost(model_costs: &ModelCosts, input: &SpanCostInput) -> CostEntry {
    let costs = &model_costs.0;

    // Determine if threshold pricing applies
    let threshold = find_applicable_threshold(costs, input.prompt_tokens);
    let threshold_suffix = threshold.as_ref().map(|t| t.suffix.as_str());

    // Build the base cost key names, potentially with threshold suffix
    let (input_key, output_key, cache_creation_key, cache_read_key) =
        if let Some(suffix) = threshold_suffix {
            (
                format!("input_cost_per_token_above_{}_tokens", suffix),
                format!("output_cost_per_token_above_{}_tokens", suffix),
                format!(
                    "cache_creation_input_token_cost_above_{}_tokens",
                    suffix
                ),
                format!("cache_read_input_token_cost_above_{}_tokens", suffix),
            )
        } else {
            (
                "input_cost_per_token".to_string(),
                "output_cost_per_token".to_string(),
                "cache_creation_input_token_cost".to_string(),
                "cache_read_input_token_cost".to_string(),
            )
        };

    // For threshold pricing, fall back to base keys if threshold-specific ones don't exist
    let input_cost_per_token =
        get_cost(costs, &input_key).or_else(|| get_cost(costs, "input_cost_per_token"));
    let output_cost_per_token =
        get_cost(costs, &output_key).or_else(|| get_cost(costs, "output_cost_per_token"));
    let cache_creation_cost_per_token = get_cost(costs, &cache_creation_key)
        .or_else(|| get_cost(costs, "cache_creation_input_token_cost"));
    let cache_read_cost_per_token = get_cost(costs, &cache_read_key)
        .or_else(|| get_cost(costs, "cache_read_input_token_cost"));

    let service_tier = input.service_tier.as_deref().and_then(|t| {
        let t = t.to_lowercase();
        if t == "flex" || t == "priority" {
            Some(t)
        } else {
            None
        }
    });
    let tier = service_tier.as_deref();

    // === INPUT COST ===
    let mut total_input_cost = 0.0;

    if input.is_batch {
        // Batch pricing
        let batch_input_cost = resolve_cost_key(costs, "input_cost_per_token_batches", tier)
            .unwrap_or_else(|| input_cost_per_token.unwrap_or(0.0) / 2.0);
        total_input_cost += input.prompt_tokens as f64 * batch_input_cost;
    } else {
        // Regular input tokens
        let resolved_input_cost =
            resolve_cost_key(costs, &input_key, tier).or(input_cost_per_token);
        total_input_cost += input.prompt_tokens as f64 * resolved_input_cost.unwrap_or(0.0);
    }

    // Cache read tokens
    if input.cache_read_tokens > 0 {
        let resolved_cache_read = resolve_cost_key(costs, &cache_read_key, tier)
            .or(cache_read_cost_per_token);
        total_input_cost += input.cache_read_tokens as f64 * resolved_cache_read.unwrap_or(0.0);
    }

    // Cache creation tokens
    if input.cache_creation_tokens > 0 {
        // If we have ephemeral breakdown, use it
        if input.cache_creation_5m_tokens > 0 || input.cache_creation_1h_tokens > 0 {
            // 5-minute tokens use regular cache creation cost
            let cost_5m = resolve_cost_key(costs, &cache_creation_key, tier)
                .or(cache_creation_cost_per_token);
            total_input_cost +=
                input.cache_creation_5m_tokens as f64 * cost_5m.unwrap_or(0.0);

            // 1-hour tokens use cache_creation_input_token_cost_above_1hr
            let hr_key = if let Some(suffix) = threshold_suffix {
                format!(
                    "cache_creation_input_token_cost_above_1hr_above_{}_tokens",
                    suffix
                )
            } else {
                "cache_creation_input_token_cost_above_1hr".to_string()
            };
            let cost_1h = resolve_cost_key(costs, &hr_key, tier)
                .or_else(|| {
                    resolve_cost_key(costs, "cache_creation_input_token_cost_above_1hr", tier)
                })
                .or(cache_creation_cost_per_token);
            total_input_cost +=
                input.cache_creation_1h_tokens as f64 * cost_1h.unwrap_or(0.0);
        } else {
            let resolved_cache_create = resolve_cost_key(costs, &cache_creation_key, tier)
                .or(cache_creation_cost_per_token);
            total_input_cost +=
                input.cache_creation_tokens as f64 * resolved_cache_create.unwrap_or(0.0);
        }
    }

    // Audio input tokens
    if input.audio_input_tokens > 0 {
        let audio_cost = resolve_cost_key(costs, "input_cost_per_audio_token", tier)
            .or(input_cost_per_token);
        total_input_cost += input.audio_input_tokens as f64 * audio_cost.unwrap_or(0.0);
    }

    // === OUTPUT COST ===
    let mut total_output_cost = 0.0;

    if input.is_batch {
        // Batch pricing
        let batch_output_cost = resolve_cost_key(costs, "output_cost_per_token_batches", tier)
            .unwrap_or_else(|| output_cost_per_token.unwrap_or(0.0) / 2.0);
        total_output_cost += input.completion_tokens as f64 * batch_output_cost;
    } else {
        // Regular output tokens
        let resolved_output_cost =
            resolve_cost_key(costs, &output_key, tier).or(output_cost_per_token);
        total_output_cost += input.completion_tokens as f64 * resolved_output_cost.unwrap_or(0.0);
    }

    // Reasoning tokens
    if input.reasoning_tokens > 0 {
        let reasoning_cost = resolve_cost_key(costs, "output_cost_per_reasoning_token", tier)
            .or(output_cost_per_token);
        total_output_cost += input.reasoning_tokens as f64 * reasoning_cost.unwrap_or(0.0);
    }

    // Audio output tokens
    if input.audio_output_tokens > 0 {
        let audio_cost = resolve_cost_key(costs, "output_cost_per_audio_token", tier)
            .or(output_cost_per_token);
        total_output_cost += input.audio_output_tokens as f64 * audio_cost.unwrap_or(0.0);
    }

    CostEntry {
        input_cost: total_input_cost,
        output_cost: total_output_cost,
    }
}
