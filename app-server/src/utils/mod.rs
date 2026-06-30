pub mod limits;
pub mod text_cleaning;

use serde_json::Value;

#[cfg(feature = "signals")]
use crate::{db::projects::WorkspaceTierName, env::private::signals};

/// Cost in micro-USD (1e-6 USD) of the given signal token spend, priced at the
/// per-token rate for `tier` (see `env::private::signals`).
///
/// `input_tokens` is the provider-reported prompt token count, which *includes*
/// `cache_read_tokens` as a subset (every provider sums cached reads into the
/// prompt total). To avoid charging cached reads at the full input rate, the
/// cached portion is split out and billed at the cheaper cache rate; only the
/// remaining fresh input is billed at the input rate.
///
/// Pro workspaces are metered at the discounted Pro rates so accumulated cost
/// matches the cheaper rates they're actually billed at; every other tier uses
/// the standard rate. Metering Pro at the standard rate would over-count and
/// trip hard limits / soft warnings before the workspace reaches its budget.
///
/// Tokens are persisted raw and cost is derived here at read time, so a future
/// rate change re-prices historical runs. Micro-USD keeps billing arithmetic
/// in integers: it's the unit compared against tier allowances, cached, and
/// reported to Stripe (divided back to dollars only at the meter boundary).
/// At the default rates one fresh input token costs 0.5 µ$, one cached-read
/// token 0.05 µ$, and one output token 3 µ$.
#[cfg(feature = "signals")]
pub fn signal_token_cost_micro_usd(
    input_tokens: u64,
    cache_read_tokens: u64,
    output_tokens: u64,
    tier: &WorkspaceTierName,
) -> u64 {
    let is_pro = *tier == WorkspaceTierName::Pro;
    let input_rate = if is_pro {
        signals::PRO_INPUT_TOKEN_PRICE_PER_MILLION.get()
    } else {
        signals::INPUT_TOKEN_PRICE_PER_MILLION.get()
    };
    let cache_read_rate = if is_pro {
        signals::PRO_CACHE_READ_TOKEN_PRICE_PER_MILLION.get()
    } else {
        signals::CACHE_READ_TOKEN_PRICE_PER_MILLION.get()
    };
    let output_rate = if is_pro {
        signals::PRO_OUTPUT_TOKEN_PRICE_PER_MILLION.get()
    } else {
        signals::OUTPUT_TOKEN_PRICE_PER_MILLION.get()
    };

    // Cache reads are a subset of the input total; bill the non-cached
    // remainder at the input rate and the cached portion at the cache rate.
    // Clamp cache reads to the prompt total so malformed provider usage
    // metadata (cache reads above the reported prompt) can never bill more
    // tokens than the prompt actually contained.
    let cache_read_tokens = cache_read_tokens.min(input_tokens);
    let fresh_input_tokens = input_tokens - cache_read_tokens;
    let input_cost = fresh_input_tokens as f64 * input_rate;
    let cache_read_cost = cache_read_tokens as f64 * cache_read_rate;
    let output_cost = output_tokens as f64 * output_rate;
    // price_per_million µ$/token = price_per_million / 1_000_000 * 1_000_000,
    // so (tokens * price_per_million) is already in micro-USD.
    (input_cost + cache_read_cost + output_cost).round() as u64
}

pub fn json_value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.to_string(),
        _ => v.to_string(),
    }
}

/// Estimate the size of a JSON value in bytes.
/// Ignores the quotes, commas, colons, and braces.
pub fn estimate_json_size(v: &Value) -> usize {
    match v {
        Value::Null => 4,
        Value::Bool(b) => b.to_string().len(),
        Value::Number(n) => n.to_string().len(),
        Value::String(s) => s.as_bytes().len(),
        Value::Array(a) => a.iter().map(estimate_json_size).sum(),
        Value::Object(o) => o.iter().map(|(k, v)| k.len() + estimate_json_size(v)).sum(),
    }
}

/// Check if a string is a URL (http, https, or data URL)
pub fn is_url(data: &str) -> bool {
    data.starts_with("http://") || data.starts_with("https://") || data.starts_with("data:")
}

pub fn infer_image_type(base64: &str) -> &str {
    if base64.starts_with("/9j/") {
        "image/jpeg"
    } else if base64.starts_with("iVBORw0KGgo") {
        "image/png"
    } else if base64.starts_with("R0lGODlh") {
        "image/gif"
    } else if base64.starts_with("UklGR") {
        "image/webp"
    } else if base64.starts_with("PHN2Zz") {
        "image/svg+xml"
    } else {
        "image/png"
    }
}

pub fn sanitize_string(input: &str) -> String {
    // Remove Unicode null characters and invalid UTF-8 sequences
    input
        .chars()
        .filter(|&c| {
            // Keep newlines and tabs, remove other control chars
            if c == '\n' || c == '\t' {
                return true;
            }
            // Remove Unicode null characters
            if c == '\0' || c == '\u{0000}' || c == '\u{FFFE}' || c == '\u{FFFF}' {
                return false;
            }
            // Remove other control characters
            if c.is_control() {
                return false;
            }
            true
        })
        .collect::<String>()
}
