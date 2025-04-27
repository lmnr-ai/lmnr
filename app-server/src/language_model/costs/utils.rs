pub fn calculate_cost(tokens: i64, price_per_million_tokens: f64) -> f64 {
    tokens as f64 * price_per_million_tokens / 1_000_000.0
}
