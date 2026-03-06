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
static THRESHOLD_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^input_cost_per_token_above_((\d+)(k?))_tokens$").unwrap());

/// Parse a threshold numeric value from a suffix like "200k" or "128000"
fn parse_threshold_value(number_str: &str, has_k_suffix: bool) -> Option<i64> {
    let n: i64 = number_str.parse().ok()?;
    if has_k_suffix {
        Some(n * 1000)
    } else {
        Some(n)
    }
}

/// A matched threshold with its original suffix string and numeric value
pub(super) struct ThresholdMatch {
    /// The original suffix string exactly as it appears in the key (e.g. "200k", "128000")
    pub(super) suffix: String,
    /// The numeric threshold value in tokens
    pub(super) value: i64,
}

/// Find the applicable token threshold for a given prompt token count.
///
/// Scans the costs JSON for keys matching `input_cost_per_token_above_{N}_tokens`
/// and returns the highest threshold that is exceeded by prompt_tokens,
/// preserving the exact suffix string from the key.
pub(super) fn find_applicable_threshold(
    costs: &Value,
    prompt_tokens: i64,
) -> Option<ThresholdMatch> {
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

/// For batch requests, try the batch-specific key first, falling back to base_rate / 2.
/// For non-batch, return base_rate as-is.
fn resolve_batch_or_base(
    costs: &Value,
    batch_key: &str,
    base_rate: f64,
    tier: Option<&str>,
    is_batch: bool,
) -> f64 {
    if is_batch {
        resolve_cost_key(costs, batch_key, tier).unwrap_or(base_rate / 2.0)
    } else {
        base_rate
    }
}

/// Calculate cost for a span given the costs JSON and span input tokens/attributes.
pub fn calculate_span_cost(model_costs: &ModelCosts, input: &SpanCostInput) -> CostEntry {
    let costs = &model_costs.0;

    // Threshold pricing is based on total context length including cached tokens
    let total_input_tokens =
        input.prompt_tokens + input.cache_read_tokens + input.cache_creation_tokens;
    let threshold = find_applicable_threshold(costs, total_input_tokens);
    let threshold_suffix = threshold.as_ref().map(|t| t.suffix.as_str());

    // Build the base cost key names, potentially with threshold suffix
    let (input_key, output_key, cache_creation_key, cache_read_key) =
        if let Some(suffix) = threshold_suffix {
            (
                format!("input_cost_per_token_above_{}_tokens", suffix),
                format!("output_cost_per_token_above_{}_tokens", suffix),
                format!("cache_creation_input_token_cost_above_{}_tokens", suffix),
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

    let tier = input.service_tier.as_deref().filter(|t| !t.is_empty());

    // For threshold pricing, fall back to base keys if threshold-specific ones don't exist.
    // Uses resolve_cost_key so tier-specific rates are preferred over base rates.
    let input_cost_per_token = resolve_cost_key(costs, &input_key, tier)
        .or_else(|| resolve_cost_key(costs, "input_cost_per_token", tier));
    let output_cost_per_token = resolve_cost_key(costs, &output_key, tier)
        .or_else(|| resolve_cost_key(costs, "output_cost_per_token", tier));
    let cache_creation_cost_per_token = resolve_cost_key(costs, &cache_creation_key, tier)
        .or_else(|| resolve_cost_key(costs, "cache_creation_input_token_cost", tier));
    let cache_read_cost_per_token = resolve_cost_key(costs, &cache_read_key, tier)
        .or_else(|| resolve_cost_key(costs, "cache_read_input_token_cost", tier));

    // === INPUT COST ===
    let mut total_input_cost = 0.0;

    // prompt_tokens includes audio_input_tokens per API convention;
    // subtract them so they're only charged at their specific rate below.
    let base_input_tokens = (input.prompt_tokens - input.audio_input_tokens).max(0);

    let input_rate = input_cost_per_token.unwrap_or(0.0);
    let input_cost =
        resolve_batch_or_base(costs, "input_cost_per_token_batches", input_rate, tier, input.is_batch);
    total_input_cost += base_input_tokens as f64 * input_cost;

    // Cache read tokens
    if input.cache_read_tokens > 0 {
        let cache_read_rate = cache_read_cost_per_token.unwrap_or(0.0);
        total_input_cost += input.cache_read_tokens as f64 * cache_read_rate;
    }

    // Cache creation tokens
    if input.cache_creation_tokens > 0 {
        // If we have ephemeral breakdown, use it
        if input.cache_creation_5m_tokens > 0 || input.cache_creation_1h_tokens > 0 {
            // 5-minute tokens use regular cache creation cost
            let cost_5m = cache_creation_cost_per_token.unwrap_or(0.0);
            total_input_cost += input.cache_creation_5m_tokens as f64 * cost_5m;

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
                .or(cache_creation_cost_per_token)
                .unwrap_or(0.0);
            total_input_cost += input.cache_creation_1h_tokens as f64 * cost_1h;
        } else {
            let cache_create_rate = cache_creation_cost_per_token.unwrap_or(0.0);
            total_input_cost += input.cache_creation_tokens as f64 * cache_create_rate;
        }
    }

    // Audio input tokens
    if input.audio_input_tokens > 0 {
        let audio_rate = resolve_cost_key(costs, "input_cost_per_audio_token", tier)
            .or(input_cost_per_token)
            .unwrap_or(0.0);
        let audio_cost = resolve_batch_or_base(
            costs, "input_cost_per_audio_token_batches", audio_rate, tier, input.is_batch,
        );
        total_input_cost += input.audio_input_tokens as f64 * audio_cost;
    }

    // === OUTPUT COST ===
    let mut total_output_cost = 0.0;

    // completion_tokens includes reasoning_tokens and audio_output_tokens per API convention;
    // subtract them so they're only charged at their specific rates below.
    let base_output_tokens =
        (input.completion_tokens - input.reasoning_tokens - input.audio_output_tokens).max(0);

    let output_rate = output_cost_per_token.unwrap_or(0.0);
    let output_cost = resolve_batch_or_base(
        costs, "output_cost_per_token_batches", output_rate, tier, input.is_batch,
    );
    total_output_cost += base_output_tokens as f64 * output_cost;

    // Reasoning tokens
    if input.reasoning_tokens > 0 {
        let reasoning_rate = resolve_cost_key(costs, "output_cost_per_reasoning_token", tier)
            .or(output_cost_per_token)
            .unwrap_or(0.0);
        let reasoning_cost = resolve_batch_or_base(
            costs, "output_cost_per_reasoning_token_batches", reasoning_rate, tier, input.is_batch,
        );
        total_output_cost += input.reasoning_tokens as f64 * reasoning_cost;
    }

    // Audio output tokens
    if input.audio_output_tokens > 0 {
        let audio_rate = resolve_cost_key(costs, "output_cost_per_audio_token", tier)
            .or(output_cost_per_token)
            .unwrap_or(0.0);
        let audio_cost = resolve_batch_or_base(
            costs, "output_cost_per_audio_token_batches", audio_rate, tier, input.is_batch,
        );
        total_output_cost += input.audio_output_tokens as f64 * audio_cost;
    }

    CostEntry {
        input_cost: total_input_cost,
        output_cost: total_output_cost,
    }
}
