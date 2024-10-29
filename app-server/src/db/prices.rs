use serde_json::Value;
use sqlx::{FromRow, PgPool};

#[derive(FromRow)]
pub struct DBPriceEntry {
    pub provider: String,
    pub model: String,
    pub input_price_per_million: f64,
    pub output_price_per_million: f64,
    pub input_cached_price_per_million: Option<f64>,
    pub additional_prices: Value,
}

pub async fn get_price(pool: &PgPool, provider: &str, model: &str) -> anyhow::Result<DBPriceEntry> {
    let price = sqlx::query_as::<_, DBPriceEntry>(
        "SELECT
            provider,
            model,
            input_price_per_million,
            output_price_per_million,
            input_cached_price_per_million,
            additional_prices
        FROM
            llm_prices
        WHERE
            provider = $1
            AND model = $2
        ORDER BY
            updated_at DESC,
            created_at DESC
        ",
    )
    .bind(provider)
    .bind(model)
    .fetch_one(pool)
    .await?;

    Ok(price)
}
