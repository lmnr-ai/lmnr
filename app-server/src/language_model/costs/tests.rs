use serde_json::json;

use super::cost_calculator::{CostEntry, SpanCostInput, calculate_span_cost};
use super::{ModelCosts, ModelInfo};

fn make_costs(value: serde_json::Value) -> ModelCosts {
    ModelCosts(value)
}

fn default_input() -> SpanCostInput {
    SpanCostInput::default()
}

// ===== ModelInfo extraction tests =====

#[test]
fn test_model_info_basic() {
    let info = ModelInfo::extract("gpt-4o", Some("openai"), None);
    assert_eq!(info.model, "gpt-4o");
    assert_eq!(info.provider.as_deref(), Some("openai"));
    assert_eq!(info.raw_model, "gpt-4o");
    assert!(info.region.is_none());
}

#[test]
fn test_model_info_with_region() {
    let info = ModelInfo::extract("gpt-4o", Some("openai"), Some("us-east-1"));
    assert_eq!(info.provider.as_deref(), Some("openai"));
    assert_eq!(info.region.as_deref(), Some("us-east-1"));
}

#[test]
fn test_model_info_provider_from_model_prefix() {
    let info = ModelInfo::extract("anthropic/claude-sonnet-4-5", None, None);
    assert_eq!(info.provider.as_deref(), Some("anthropic"));
    assert_eq!(info.raw_model, "claude-sonnet-4-5");
}

#[test]
fn test_model_info_no_provider_no_slash() {
    let info = ModelInfo::extract("gpt-4o", None, None);
    assert!(info.provider.is_none());
    assert_eq!(info.raw_model, "gpt-4o");
}

#[test]
fn test_model_info_provider_case_insensitive() {
    let info = ModelInfo::extract("gpt-4o", Some("OpenAI"), None);
    assert_eq!(info.provider.as_deref(), Some("openai"));
}

#[test]
fn test_model_info_bedrock_with_region() {
    let info = ModelInfo::extract(
        "bedrock/us-east-1/anthropic.claude-v2",
        Some("bedrock"),
        Some("us-east-1"),
    );
    assert_eq!(info.provider.as_deref(), Some("bedrock"));
    assert_eq!(info.region.as_deref(), Some("us-east-1"));
    assert_eq!(info.raw_model, "us-east-1/anthropic.claude-v2");
    assert_eq!(info.model, "bedrock/us-east-1/anthropic.claude-v2");
}

// ===== Lookup key generation tests =====

#[test]
fn test_lookup_keys_full() {
    let info = ModelInfo::extract(
        "bedrock/us-east-1/anthropic.claude-v2",
        Some("bedrock"),
        Some("us-east-1"),
    );
    let keys = info.lookup_keys();
    assert_eq!(
        keys,
        vec![
            "bedrock/us-east-1/bedrock/us-east-1/anthropic.claude-v2",
            "bedrock/bedrock/us-east-1/anthropic.claude-v2",
            "bedrock/us-east-1/anthropic.claude-v2",
            "us-east-1/anthropic.claude-v2",
        ]
    );
}

#[test]
fn test_lookup_keys_provider_only() {
    let info = ModelInfo::extract("gpt-4o", Some("openai"), None);
    let keys = info.lookup_keys();
    assert_eq!(keys, vec!["openai/gpt-4o", "gpt-4o"]);
}

#[test]
fn test_lookup_keys_no_provider() {
    let info = ModelInfo::extract("gpt-4o", None, None);
    let keys = info.lookup_keys();
    assert_eq!(keys, vec!["gpt-4o"]);
}

#[test]
fn test_lookup_keys_inferred_provider() {
    let info = ModelInfo::extract("anthropic/claude-sonnet-4-5", None, None);
    let keys = info.lookup_keys();
    assert_eq!(
        keys,
        vec![
            "anthropic/anthropic/claude-sonnet-4-5",
            "anthropic/claude-sonnet-4-5",
            "claude-sonnet-4-5",
        ]
    );
}

// ===== Basic cost calculation tests =====

#[test]
fn test_basic_input_output_cost() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
    }));
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 1000.0 * 0.000003);
    assert_float_eq(result.output_cost, 500.0 * 0.000015);
}

#[test]
fn test_zero_tokens() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
    }));
    let input = default_input();
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 0.0);
    assert_float_eq(result.output_cost, 0.0);
}

#[test]
fn test_missing_cost_fields() {
    let costs = make_costs(json!({}));
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 0.0);
    assert_float_eq(result.output_cost, 0.0);
}

// ===== Cache token pricing tests =====

#[test]
fn test_cache_read_tokens() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "cache_read_input_token_cost": 0.0000003,
    }));
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        cache_read_tokens: 2000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(
        result.input_cost,
        1000.0 * 0.000003 + 2000.0 * 0.0000003,
    );
}

#[test]
fn test_cache_creation_tokens() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "cache_creation_input_token_cost": 0.00000375,
    }));
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        cache_creation_tokens: 3000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(
        result.input_cost,
        1000.0 * 0.000003 + 3000.0 * 0.00000375,
    );
}

#[test]
fn test_ephemeral_cache_tokens() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "cache_creation_input_token_cost": 0.00000375,
        "cache_creation_input_token_cost_above_1hr": 0.0000075,
    }));
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        cache_creation_tokens: 5000,
        cache_creation_5m_tokens: 2000,
        cache_creation_1h_tokens: 3000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    // 5-minute tokens use regular cache creation cost
    // 1-hour tokens use above_1hr cost
    assert_float_eq(
        result.input_cost,
        1000.0 * 0.000003 + 2000.0 * 0.00000375 + 3000.0 * 0.0000075,
    );
}

// ===== Threshold pricing tests =====

#[test]
fn test_threshold_pricing_200k() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "input_cost_per_token_above_200k_tokens": 0.000006,
        "output_cost_per_token_above_200k_tokens": 0.00003,
    }));
    // Above 200k tokens
    let input = SpanCostInput {
        prompt_tokens: 250_000,
        completion_tokens: 1000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    // Threshold applies to entire message
    assert_float_eq(result.input_cost, 250_000.0 * 0.000006);
    assert_float_eq(result.output_cost, 1000.0 * 0.00003);
}

#[test]
fn test_threshold_pricing_below_threshold() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "input_cost_per_token_above_200k_tokens": 0.000006,
        "output_cost_per_token_above_200k_tokens": 0.00003,
    }));
    // Below 200k tokens - should use base pricing
    let input = SpanCostInput {
        prompt_tokens: 100_000,
        completion_tokens: 1000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 100_000.0 * 0.000003);
    assert_float_eq(result.output_cost, 1000.0 * 0.000015);
}

#[test]
fn test_threshold_pricing_128k() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000000075,
        "output_cost_per_token": 0.0000003,
        "input_cost_per_token_above_128k_tokens": 0.000001,
        "output_cost_per_token_above_128k_tokens": 0.0000006,
    }));
    // Above 128k tokens
    let input = SpanCostInput {
        prompt_tokens: 200_000,
        completion_tokens: 5000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 200_000.0 * 0.000001);
    assert_float_eq(result.output_cost, 5000.0 * 0.0000006);
}

#[test]
fn test_threshold_pricing_with_cache_tokens() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "cache_read_input_token_cost": 0.0000003,
        "cache_creation_input_token_cost": 0.00000375,
        "input_cost_per_token_above_200k_tokens": 0.000006,
        "output_cost_per_token_above_200k_tokens": 0.00003,
        "cache_read_input_token_cost_above_200k_tokens": 0.0000006,
        "cache_creation_input_token_cost_above_200k_tokens": 0.0000075,
    }));
    let input = SpanCostInput {
        prompt_tokens: 250_000,
        completion_tokens: 1000,
        cache_read_tokens: 5000,
        cache_creation_tokens: 3000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(
        result.input_cost,
        250_000.0 * 0.000006 + 5000.0 * 0.0000006 + 3000.0 * 0.0000075,
    );
    assert_float_eq(result.output_cost, 1000.0 * 0.00003);
}

#[test]
fn test_multiple_thresholds_picks_highest_exceeded() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000001,
        "output_cost_per_token": 0.000002,
        "input_cost_per_token_above_128k_tokens": 0.000002,
        "input_cost_per_token_above_200k_tokens": 0.000003,
    }));
    // 300k tokens > both 128k and 200k, should use 200k pricing
    let input = SpanCostInput {
        prompt_tokens: 300_000,
        completion_tokens: 100,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 300_000.0 * 0.000003);
}

#[test]
fn test_threshold_between_two_levels() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000001,
        "output_cost_per_token": 0.000002,
        "input_cost_per_token_above_128k_tokens": 0.000002,
        "input_cost_per_token_above_200k_tokens": 0.000003,
    }));
    // 150k tokens > 128k but < 200k, should use 128k pricing
    let input = SpanCostInput {
        prompt_tokens: 150_000,
        completion_tokens: 100,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 150_000.0 * 0.000002);
}

// ===== Service tier pricing tests =====

#[test]
fn test_flex_tier_pricing() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.00000125,
        "output_cost_per_token": 0.00001,
        "input_cost_per_token_flex": 0.000000625,
        "output_cost_per_token_flex": 0.000005,
        "cache_read_input_token_cost": 0.000000125,
        "cache_read_input_token_cost_flex": 0.0000000625,
    }));
    let input = SpanCostInput {
        prompt_tokens: 10_000,
        completion_tokens: 5000,
        cache_read_tokens: 2000,
        service_tier: Some("flex".to_string()),
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(
        result.input_cost,
        10_000.0 * 0.000000625 + 2000.0 * 0.0000000625,
    );
    assert_float_eq(result.output_cost, 5000.0 * 0.000005);
}

#[test]
fn test_priority_tier_pricing() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.00000125,
        "output_cost_per_token": 0.00001,
        "input_cost_per_token_priority": 0.0000025,
        "output_cost_per_token_priority": 0.00002,
        "cache_read_input_token_cost": 0.000000125,
        "cache_read_input_token_cost_priority": 0.00000025,
    }));
    let input = SpanCostInput {
        prompt_tokens: 10_000,
        completion_tokens: 5000,
        cache_read_tokens: 2000,
        service_tier: Some("priority".to_string()),
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(
        result.input_cost,
        10_000.0 * 0.0000025 + 2000.0 * 0.00000025,
    );
    assert_float_eq(result.output_cost, 5000.0 * 0.00002);
}

#[test]
fn test_tier_fallback_to_base() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
    }));
    // Tier specified but no tier-specific costs -> fall back to base
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        service_tier: Some("flex".to_string()),
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 1000.0 * 0.000003);
    assert_float_eq(result.output_cost, 500.0 * 0.000015);
}

#[test]
fn test_unknown_tier_ignored() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
    }));
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        service_tier: Some("standard".to_string()),
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 1000.0 * 0.000003);
    assert_float_eq(result.output_cost, 500.0 * 0.000015);
}

// ===== Batch pricing tests =====

#[test]
fn test_batch_pricing_explicit() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "input_cost_per_token_batches": 0.0000015,
        "output_cost_per_token_batches": 0.0000075,
    }));
    let input = SpanCostInput {
        prompt_tokens: 10_000,
        completion_tokens: 5000,
        is_batch: true,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 10_000.0 * 0.0000015);
    assert_float_eq(result.output_cost, 5000.0 * 0.0000075);
}

#[test]
fn test_batch_pricing_fallback_half() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
    }));
    // No batch-specific fields, should use default / 2
    let input = SpanCostInput {
        prompt_tokens: 10_000,
        completion_tokens: 5000,
        is_batch: true,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 10_000.0 * 0.000003 / 2.0);
    assert_float_eq(result.output_cost, 5000.0 * 0.000015 / 2.0);
}

// ===== Audio token pricing tests =====

#[test]
fn test_audio_tokens() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "input_cost_per_audio_token": 0.00011,
        "output_cost_per_audio_token": 0.00022,
    }));
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        audio_input_tokens: 200,
        audio_output_tokens: 100,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(
        result.input_cost,
        1000.0 * 0.000003 + 200.0 * 0.00011,
    );
    assert_float_eq(
        result.output_cost,
        500.0 * 0.000015 + 100.0 * 0.00022,
    );
}

#[test]
fn test_audio_tokens_fallback() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
    }));
    // No audio-specific costs, fallback to regular
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        audio_input_tokens: 200,
        audio_output_tokens: 100,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(
        result.input_cost,
        1000.0 * 0.000003 + 200.0 * 0.000003,
    );
    assert_float_eq(
        result.output_cost,
        500.0 * 0.000015 + 100.0 * 0.000015,
    );
}

// ===== Reasoning token pricing tests =====

#[test]
fn test_reasoning_tokens() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "output_cost_per_reasoning_token": 0.00001,
    }));
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        reasoning_tokens: 300,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 1000.0 * 0.000003);
    assert_float_eq(
        result.output_cost,
        500.0 * 0.000015 + 300.0 * 0.00001,
    );
}

#[test]
fn test_reasoning_tokens_fallback() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
    }));
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        reasoning_tokens: 300,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 1000.0 * 0.000003);
    assert_float_eq(
        result.output_cost,
        500.0 * 0.000015 + 300.0 * 0.000015,
    );
}

// ===== Combined scenario tests =====

#[test]
fn test_anthropic_claude_full_scenario() {
    // Simulating claude-sonnet-4-5 pricing with all features
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "cache_read_input_token_cost": 0.0000003,
        "cache_creation_input_token_cost": 0.00000375,
        "input_cost_per_token_above_200k_tokens": 0.000006,
        "output_cost_per_token_above_200k_tokens": 0.000030,
        "cache_read_input_token_cost_above_200k_tokens": 0.0000006,
        "cache_creation_input_token_cost_above_200k_tokens": 0.0000075,
        "cache_creation_input_token_cost_above_1hr": 0.0000075,
        "cache_creation_input_token_cost_above_1hr_above_200k_tokens": 0.000015,
    }));

    // Scenario: 250k prompt tokens (above 200k threshold), with cache tokens
    let input = SpanCostInput {
        prompt_tokens: 250_000,
        completion_tokens: 2000,
        cache_read_tokens: 10_000,
        cache_creation_tokens: 5000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    // All use above-200k pricing
    assert_float_eq(
        result.input_cost,
        250_000.0 * 0.000006 + 10_000.0 * 0.0000006 + 5000.0 * 0.0000075,
    );
    assert_float_eq(result.output_cost, 2000.0 * 0.000030);
}

#[test]
fn test_anthropic_claude_with_1hr_cache_above_threshold() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "cache_creation_input_token_cost": 0.00000375,
        "input_cost_per_token_above_200k_tokens": 0.000006,
        "output_cost_per_token_above_200k_tokens": 0.000030,
        "cache_creation_input_token_cost_above_200k_tokens": 0.0000075,
        "cache_creation_input_token_cost_above_1hr": 0.0000075,
        "cache_creation_input_token_cost_above_1hr_above_200k_tokens": 0.000015,
    }));

    let input = SpanCostInput {
        prompt_tokens: 250_000,
        completion_tokens: 1000,
        cache_creation_tokens: 10_000,
        cache_creation_5m_tokens: 4000,
        cache_creation_1h_tokens: 6000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    // 5m tokens: use above_200k cache creation cost
    // 1h tokens: use above_1hr_above_200k cost
    assert_float_eq(
        result.input_cost,
        250_000.0 * 0.000006 + 4000.0 * 0.0000075 + 6000.0 * 0.000015,
    );
}

#[test]
fn test_openai_gpt5_flex_tier() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.00000125,
        "output_cost_per_token": 0.00001,
        "input_cost_per_token_flex": 0.000000625,
        "output_cost_per_token_flex": 0.000005,
        "cache_read_input_token_cost": 0.000000125,
        "cache_read_input_token_cost_flex": 0.0000000625,
    }));

    let input = SpanCostInput {
        prompt_tokens: 50_000,
        completion_tokens: 10_000,
        cache_read_tokens: 20_000,
        service_tier: Some("flex".to_string()),
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(
        result.input_cost,
        50_000.0 * 0.000000625 + 20_000.0 * 0.0000000625,
    );
    assert_float_eq(result.output_cost, 10_000.0 * 0.000005);
}

#[test]
fn test_batch_with_cache_tokens() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "input_cost_per_token_batches": 0.0000015,
        "output_cost_per_token_batches": 0.0000075,
        "cache_read_input_token_cost": 0.0000003,
    }));
    let input = SpanCostInput {
        prompt_tokens: 10_000,
        completion_tokens: 5000,
        cache_read_tokens: 2000,
        is_batch: true,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    // Batch pricing for prompt/completion, regular cache pricing
    assert_float_eq(
        result.input_cost,
        10_000.0 * 0.0000015 + 2000.0 * 0.0000003,
    );
    assert_float_eq(result.output_cost, 5000.0 * 0.0000075);
}

#[test]
fn test_gemini_flash_above_128k_with_audio() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000000075,
        "output_cost_per_token": 0.0000003,
        "input_cost_per_token_above_128k_tokens": 0.000001,
        "output_cost_per_token_above_128k_tokens": 0.0000006,
        "input_cost_per_audio_token": 0.000002,
    }));
    let input = SpanCostInput {
        prompt_tokens: 200_000,
        completion_tokens: 5000,
        audio_input_tokens: 1000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(
        result.input_cost,
        200_000.0 * 0.000001 + 1000.0 * 0.000002,
    );
    assert_float_eq(result.output_cost, 5000.0 * 0.0000006);
}

#[test]
fn test_realtime_model_with_audio_io() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.0000055,
        "output_cost_per_token": 0.000022,
        "input_cost_per_audio_token": 0.00011,
        "output_cost_per_audio_token": 0.00022,
        "cache_read_input_token_cost": 0.00000275,
    }));
    let input = SpanCostInput {
        prompt_tokens: 5000,
        completion_tokens: 2000,
        audio_input_tokens: 10_000,
        audio_output_tokens: 8000,
        cache_read_tokens: 3000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(
        result.input_cost,
        5000.0 * 0.0000055 + 10_000.0 * 0.00011 + 3000.0 * 0.00000275,
    );
    assert_float_eq(
        result.output_cost,
        2000.0 * 0.000022 + 8000.0 * 0.00022,
    );
}

#[test]
fn test_reasoning_with_priority_tier() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "input_cost_per_token_priority": 0.000006,
        "output_cost_per_token_priority": 0.00003,
        "output_cost_per_reasoning_token": 0.00001,
    }));
    let input = SpanCostInput {
        prompt_tokens: 10_000,
        completion_tokens: 5000,
        reasoning_tokens: 20_000,
        service_tier: Some("priority".to_string()),
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 10_000.0 * 0.000006);
    // Output uses priority pricing, reasoning uses reasoning cost
    assert_float_eq(
        result.output_cost,
        5000.0 * 0.00003 + 20_000.0 * 0.00001,
    );
}

// ===== Edge case tests =====

#[test]
fn test_threshold_exactly_at_boundary() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000001,
        "output_cost_per_token": 0.000002,
        "input_cost_per_token_above_128k_tokens": 0.000002,
    }));
    // Exactly at 128k - should NOT trigger threshold (need to exceed it)
    let input = SpanCostInput {
        prompt_tokens: 128_000,
        completion_tokens: 100,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 128_000.0 * 0.000001);
}

#[test]
fn test_threshold_one_above() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000001,
        "output_cost_per_token": 0.000002,
        "input_cost_per_token_above_128k_tokens": 0.000002,
    }));
    // One above 128k - should trigger threshold
    let input = SpanCostInput {
        prompt_tokens: 128_001,
        completion_tokens: 100,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 128_001.0 * 0.000002);
}

#[test]
fn test_numeric_threshold_no_k_suffix() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000001,
        "output_cost_per_token": 0.000002,
        "input_cost_per_token_above_128000_tokens": 0.000002,
    }));
    let input = SpanCostInput {
        prompt_tokens: 200_000,
        completion_tokens: 100,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 200_000.0 * 0.000002);
}

// ===== Helper =====

fn assert_float_eq(a: f64, b: f64) {
    let diff = (a - b).abs();
    assert!(
        diff < 1e-12,
        "Floats not equal: {} vs {} (diff: {})",
        a,
        b,
        diff
    );
}
