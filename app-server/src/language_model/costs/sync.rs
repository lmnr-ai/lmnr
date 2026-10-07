//! Keeps the universal `model_costs` table in sync with litellm's price list.
//! Port of the Cloud job in `lmnr-ai/model-costs` (`main.py`); keep the row
//! building identical so self-hosted and Cloud price the same models the same way.

use std::{sync::Arc, time::Duration};

use indexmap::IndexMap;
use serde_json::{Map, Value};
use tokio::time::{self, MissedTickBehavior};

use crate::{
    cache::{Cache, CacheTrait, keys::MODEL_COSTS_SYNC_LOCK_CACHE_KEY},
    db::{self, DB},
};

const PRICES_URL: &str =
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const FETCH_TIMEOUT: Duration = Duration::from_secs(30);

const SYNC_INTERVAL_SECONDS: u64 = 6 * 60 * 60;
// Only decides how soon a failed sync is retried; the lock TTL sets the schedule.
const TICK_INTERVAL_SECONDS: u64 = 600;

const SHORT_NAME_PREFIXES: [&str; 4] = ["mistral", "xai", "minimax", "moonshot"];
const FLEX_PRICING_MODELS: [&str; 2] = ["gemini-3-flash-preview", "gemini-3.5-flash"];
const FLEX_COST_FIELDS: [&str; 3] = [
    "input_cost_per_token",
    "output_cost_per_token",
    "cache_read_input_token_cost",
];

pub async fn run_model_costs_sync(db: Arc<DB>, cache: Arc<Cache>, http_client: reqwest::Client) {
    let mut interval = time::interval(Duration::from_secs(TICK_INTERVAL_SECONDS));
    interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        interval.tick().await;

        match cache
            .try_acquire_lock(MODEL_COSTS_SYNC_LOCK_CACHE_KEY, SYNC_INTERVAL_SECONDS)
            .await
        {
            Ok(true) => match sync_model_costs(&db, &http_client).await {
                Ok(count) => {
                    log::info!("[Model Costs Sync] Upserted {count} rows into model_costs")
                }
                Err(e) => {
                    log::warn!("[Model Costs Sync] Failed, retrying on next tick: {e:?}");
                    if let Err(e) = cache.release_lock(MODEL_COSTS_SYNC_LOCK_CACHE_KEY).await {
                        log::warn!("[Model Costs Sync] Failed to release lock: {e:?}");
                    }
                }
            },
            Ok(false) => {
                log::debug!("[Model Costs Sync] Synced within the interval, skipping");
            }
            Err(e) => {
                log::warn!("[Model Costs Sync] Failed to acquire lock: {e:?}");
            }
        }
    }
}

async fn sync_model_costs(db: &DB, http_client: &reqwest::Client) -> anyhow::Result<usize> {
    let data = http_client
        .get(PRICES_URL)
        .timeout(FETCH_TIMEOUT)
        .send()
        .await?
        .error_for_status()?
        .json::<Map<String, Value>>()
        .await?;

    let rows = build_rows(data);
    db::model_costs::upsert_model_costs(&db.pool, &rows).await?;
    Ok(rows.len())
}

/// Keys are lowercased model names. Models under `SHORT_NAME_PREFIXES` also get
/// their last path segment as an alias, unless that name is already taken.
fn build_rows(data: Map<String, Value>) -> Vec<(String, Value)> {
    let mut rows: IndexMap<String, Value> = IndexMap::new();
    for (model_name, mut info) in data {
        if model_name == "sample_spec" {
            continue;
        }
        let short_name = model_name.rsplit('/').next().unwrap_or(&model_name);
        if FLEX_PRICING_MODELS.contains(&short_name) {
            add_flex_pricing(&mut info);
        }
        rows.insert(model_name.to_lowercase(), info.clone());
        if SHORT_NAME_PREFIXES
            .iter()
            .any(|p| model_name.starts_with(p))
            && short_name != model_name
        {
            rows.entry(short_name.to_lowercase()).or_insert(info);
        }
    }
    rows.into_iter().collect()
}

/// Flex tier is billed at half the standard rate; litellm doesn't list it for these models.
fn add_flex_pricing(info: &mut Value) {
    let Some(info) = info.as_object_mut() else {
        return;
    };
    for field in FLEX_COST_FIELDS {
        let flex_field = format!("{field}_flex");
        if info.contains_key(&flex_field) {
            continue;
        }
        if let Some(cost) = info.get(field).and_then(Value::as_f64) {
            info.insert(flex_field, Value::from(cost / 2.0));
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn rows_of(data: Value) -> Vec<(String, Value)> {
        let Value::Object(map) = data else {
            panic!("test data must be an object");
        };
        build_rows(map)
    }

    #[test]
    fn skips_sample_spec_and_lowercases_keys() {
        let rows = rows_of(json!({
            "sample_spec": {"input_cost_per_token": 1},
            "GPT-4o": {"input_cost_per_token": 0.1},
        }));
        assert_eq!(
            rows,
            vec![("gpt-4o".to_string(), json!({"input_cost_per_token": 0.1}))]
        );
    }

    #[test]
    fn later_case_duplicate_wins() {
        let rows = rows_of(json!({
            "gpt-4o": {"input_cost_per_token": 1},
            "GPT-4o": {"input_cost_per_token": 2},
        }));
        assert_eq!(
            rows,
            vec![("gpt-4o".to_string(), json!({"input_cost_per_token": 2}))]
        );
    }

    #[test]
    fn adds_short_name_alias_for_prefixed_models() {
        let rows = rows_of(json!({
            "mistral/mistral-large": {"input_cost_per_token": 1},
            "xai/Grok-4": {"input_cost_per_token": 2},
            "openai/gpt-4o": {"input_cost_per_token": 3},
        }));
        let keys: Vec<&str> = rows.iter().map(|(k, _)| k.as_str()).collect();
        assert_eq!(
            keys,
            vec![
                "mistral/mistral-large",
                "mistral-large",
                "xai/grok-4",
                "grok-4",
                "openai/gpt-4o"
            ]
        );
    }

    #[test]
    fn alias_never_overrides_existing_name() {
        // Taken before the prefixed model is seen.
        let rows = rows_of(json!({
            "mistral-large": {"input_cost_per_token": 1},
            "mistral/mistral-large": {"input_cost_per_token": 2},
        }));
        assert_eq!(
            rows[0],
            (
                "mistral-large".to_string(),
                json!({"input_cost_per_token": 1})
            )
        );

        // Taken after: the full model name overwrites the earlier alias.
        let rows = rows_of(json!({
            "mistral/mistral-large": {"input_cost_per_token": 2},
            "mistral-large": {"input_cost_per_token": 1},
        }));
        assert_eq!(
            rows[1],
            (
                "mistral-large".to_string(),
                json!({"input_cost_per_token": 1})
            )
        );

        // Between two aliases the first one wins.
        let rows = rows_of(json!({
            "mistral/codestral": {"input_cost_per_token": 1},
            "mistral/eu/codestral": {"input_cost_per_token": 2},
        }));
        assert_eq!(
            rows[1],
            ("codestral".to_string(), json!({"input_cost_per_token": 1}))
        );
    }

    #[test]
    fn prefix_match_is_case_sensitive_like_the_cloud_job() {
        let rows = rows_of(json!({"Mistral/Large": {"input_cost_per_token": 1}}));
        assert_eq!(rows.len(), 1);
    }

    #[test]
    fn adds_flex_pricing_for_listed_models() {
        let rows = rows_of(json!({
            "gemini/gemini-3-flash-preview": {
                "input_cost_per_token": 1,
                "output_cost_per_token": 0.4,
                "cache_read_input_token_cost_flex": 0.01,
                "cache_read_input_token_cost": 0.1,
                "max_tokens": 100,
            },
            "gemini-3.5-flash": {"input_cost_per_token": 0.2},
            "gemini-2.5-flash": {"input_cost_per_token": 0.2},
        }));
        assert_eq!(
            rows[0].1,
            json!({
                "input_cost_per_token": 1,
                "output_cost_per_token": 0.4,
                "cache_read_input_token_cost_flex": 0.01,
                "cache_read_input_token_cost": 0.1,
                "max_tokens": 100,
                "input_cost_per_token_flex": 0.5,
                "output_cost_per_token_flex": 0.2,
            })
        );
        assert_eq!(
            rows[1].1,
            json!({"input_cost_per_token": 0.2, "input_cost_per_token_flex": 0.1})
        );
        assert_eq!(rows[2].1, json!({"input_cost_per_token": 0.2}));
    }
}
