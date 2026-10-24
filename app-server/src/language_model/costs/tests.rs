use serde_json::{Value, json};
use std::{str::FromStr, sync::Arc};
use uuid::Uuid;

use super::cost_calculator::{SpanCostInput, calculate_span_cost, find_applicable_threshold};
use super::{ModelCosts, ModelInfo};

use crate::cache::{Cache, CacheTrait, in_memory::InMemoryCache};
use crate::db::DB;

fn make_costs(value: serde_json::Value) -> ModelCosts {
    ModelCosts(value)
}

fn default_input() -> SpanCostInput {
    SpanCostInput::default()
}

#[test]
fn custom_cost_cache_policy_bypasses_process_local_cache() {
    let cache = Cache::InMemory(InMemoryCache::new(None));

    assert!(!super::custom_model_cost_cache_enabled(&cache));
}

/// A stale local entry must never satisfy a custom-cost lookup. The database
/// endpoint is deliberately unreachable, so a regression that re-enables the
/// in-memory read returns the seeded value while the correct policy returns
/// `None` after the database attempt fails.
#[tokio::test]
async fn in_memory_custom_cost_lookup_does_not_return_stale_entry() {
    let project_id = Uuid::new_v4();
    let provider = "openai";
    let model = "gpt-test";
    let cache_key = format!("custom_model_costs:{project_id}:{provider}:{model}");
    let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
    cache
        .insert(
            &cache_key,
            Some(ModelCosts(json!({
                "input_cost_per_token": 999.0,
            }))),
        )
        .await
        .unwrap();

    let db = Arc::new(DB {
        pool: sqlx::postgres::PgPoolOptions::new()
            .acquire_timeout(std::time::Duration::from_millis(100))
            .connect_lazy("postgres://127.0.0.1:1/lmnr-unused")
            .unwrap(),
    });

    let result = super::get_custom_model_costs(db, cache, provider, model, &project_id).await;

    assert!(result.is_none());
}

/// This is intentionally opt-in: it creates and drops a uniquely named schema
/// in the database named by TEST_DATABASE_URL. It never reads DATABASE_URL or
/// any of the app-server's normal database settings.
#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL and a reachable PostgreSQL instance"]
async fn in_memory_custom_costs_track_create_update_and_delete() {
    let Ok(database_url) = std::env::var("TEST_DATABASE_URL") else {
        eprintln!("skipping: TEST_DATABASE_URL is not set");
        return;
    };

    let admin_pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .expect("TEST_DATABASE_URL must point to a reachable PostgreSQL database");
    let schema = generated_test_schema_name();
    // Arm cleanup before CREATE SCHEMA: if the server commits the DDL but the
    // client observes a transport error, the guard still attempts to remove
    // the generated schema during unwinding.
    let mut schema_guard =
        TestSchemaGuard::new(admin_pool.clone(), database_url.clone(), schema.clone());
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "CREATE SCHEMA {}",
        quote_test_schema_identifier(&schema)
    )))
    .execute(&admin_pool)
    .await
    .expect("the generated test schema should be creatable");

    let isolated_options = sqlx::postgres::PgConnectOptions::from_str(&database_url)
        .expect("TEST_DATABASE_URL must be a valid PostgreSQL URL")
        .options([("search_path", schema.as_str())]);
    let isolated_pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(4)
        .connect_with(isolated_options)
        .await
        .expect("the isolated test pool should connect");
    sqlx::query(
        "CREATE TABLE custom_model_costs (
            id uuid PRIMARY KEY,
            project_id uuid NOT NULL,
            provider text NOT NULL,
            model text NOT NULL,
            costs jsonb NOT NULL,
            UNIQUE (project_id, provider, model)
        )",
    )
    .execute(&isolated_pool)
    .await
    .expect("the isolated custom_model_costs table should be creatable");

    let db = Arc::new(DB {
        pool: isolated_pool.clone(),
    });
    let reader_cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
    let writer_cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
    let project_id = Uuid::new_v4();
    let provider = "openai";
    let model = "gpt-test";
    let cache_key = format!("custom_model_costs:{project_id}:{provider}:{model}");

    // Seed a negative entry in the reader process. A frontend write can clear
    // only its own local cache, represented here by the distinct writer cache.
    reader_cache
        .insert(&cache_key, None::<ModelCosts>)
        .await
        .unwrap();
    writer_cache.remove(&cache_key).await.unwrap();
    assert!(
        super::get_custom_model_costs(
            db.clone(),
            reader_cache.clone(),
            provider,
            model,
            &project_id,
        )
        .await
        .is_none(),
        "missing custom costs should remain a miss"
    );

    let created = json!({"input_cost_per_token": 0.1});
    insert_custom_cost(&isolated_pool, project_id, provider, model, &created).await;
    writer_cache.remove(&cache_key).await.unwrap();
    let result = super::get_custom_model_costs(
        db.clone(),
        reader_cache.clone(),
        provider,
        model,
        &project_id,
    )
    .await
    .expect("the newly created custom cost must be visible immediately");
    assert_eq!(result.0, created);
    assert!(
        matches!(
            reader_cache
                .get::<Option<ModelCosts>>(&cache_key)
                .await
                .unwrap(),
            Some(None)
        ),
        "the in-memory reader cache must not be rewritten by the lookup"
    );

    // Seed an old positive value, then update and delete it from the database.
    // Both writes clear only the distinct writer cache; the reader's stale
    // value remains present and therefore catches any accidental local read.
    let old = json!({"input_cost_per_token": 0.2});
    let updated = json!({"input_cost_per_token": 0.3});
    reader_cache
        .insert(&cache_key, Some(ModelCosts(old)))
        .await
        .unwrap();
    update_custom_cost(&isolated_pool, project_id, provider, model, &updated).await;
    writer_cache.remove(&cache_key).await.unwrap();
    let result = super::get_custom_model_costs(
        db.clone(),
        reader_cache.clone(),
        provider,
        model,
        &project_id,
    )
    .await
    .expect("the updated custom cost must bypass the stale local value");
    assert_eq!(result.0, updated);

    delete_custom_cost(&isolated_pool, project_id, provider, model).await;
    writer_cache.remove(&cache_key).await.unwrap();
    assert!(
        super::get_custom_model_costs(db, reader_cache, provider, model, &project_id,)
            .await
            .is_none(),
        "deleting a custom cost must be visible despite a stale local value"
    );

    isolated_pool.close().await;
    schema_guard
        .cleanup()
        .await
        .expect("the generated test schema should be cleaned up");
}

struct TestSchemaGuard {
    admin_pool: sqlx::PgPool,
    database_url: String,
    schema: String,
    cleaned: bool,
}

impl TestSchemaGuard {
    fn new(admin_pool: sqlx::PgPool, database_url: String, schema: String) -> Self {
        Self {
            admin_pool,
            database_url,
            schema,
            cleaned: false,
        }
    }

    async fn cleanup(&mut self) -> Result<(), sqlx::Error> {
        let query = sqlx::AssertSqlSafe(format!(
            "DROP SCHEMA {} CASCADE",
            quote_test_schema_identifier(&self.schema)
        ));
        let result = sqlx::query(query).execute(&self.admin_pool).await;
        if result.is_ok() {
            self.cleaned = true;
        }
        self.admin_pool.close().await;
        result.map(|_| ())
    }
}

impl Drop for TestSchemaGuard {
    fn drop(&mut self) {
        if self.cleaned {
            return;
        }

        // A task spawned on the test runtime is not reliable here: a panic
        // tears down that runtime immediately after Drop runs. Use a small
        // independent runtime on a blocking thread so ordinary assertion and
        // setup failures still remove the generated schema before the test
        // process continues.
        let database_url = self.database_url.clone();
        let schema = self.schema.clone();
        let schema_for_cleanup = schema.clone();
        let cleanup = std::thread::spawn(move || {
            cleanup_test_schema_blocking(&database_url, &schema_for_cleanup)
        });
        if let Err(error) = cleanup.join() {
            eprintln!("failed to clean up test schema {schema}: thread panicked: {error:?}");
        }
    }
}

fn generated_test_schema_name() -> String {
    format!("lmnr_custom_costs_{}", Uuid::new_v4().simple())
}

/// The schema name is used in raw DDL because PostgreSQL cannot bind an
/// identifier as a parameter. Keep the interpolation safe by accepting only
/// the fixed prefix plus the 32 lowercase hexadecimal characters emitted by
/// Uuid::simple().
fn quote_test_schema_identifier(schema: &str) -> String {
    const PREFIX: &str = "lmnr_custom_costs_";
    let suffix = schema
        .strip_prefix(PREFIX)
        .expect("test schema must use the generated prefix");
    assert_eq!(
        suffix.len(),
        32,
        "test schema suffix must be the 32-character Uuid::simple() form"
    );
    assert!(
        suffix
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()),
        "test schema suffix must contain only lowercase hexadecimal characters"
    );
    format!("\"{schema}\"")
}

fn cleanup_test_schema_blocking(database_url: &str, schema: &str) {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("cleanup runtime should build");
    runtime.block_on(async {
        let pool = match sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect(database_url)
            .await
        {
            Ok(pool) => pool,
            Err(error) => {
                eprintln!("failed to connect for test-schema cleanup {schema}: {error}");
                return;
            }
        };
        let query = sqlx::AssertSqlSafe(format!(
            "DROP SCHEMA {} CASCADE",
            quote_test_schema_identifier(schema)
        ));
        if let Err(error) = sqlx::query(query).execute(&pool).await {
            eprintln!("failed to clean up test schema {schema}: {error}");
        }
        pool.close().await;
    });
}

async fn insert_custom_cost(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    provider: &str,
    model: &str,
    costs: &Value,
) {
    sqlx::query(
        "INSERT INTO custom_model_costs (id, project_id, provider, model, costs)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(project_id)
    .bind(provider)
    .bind(model)
    .bind(costs)
    .execute(pool)
    .await
    .expect("custom cost insert should succeed");
}

async fn update_custom_cost(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    provider: &str,
    model: &str,
    costs: &Value,
) {
    sqlx::query(
        "UPDATE custom_model_costs
         SET costs = $1
         WHERE project_id = $2 AND provider = $3 AND model = $4",
    )
    .bind(costs)
    .bind(project_id)
    .bind(provider)
    .bind(model)
    .execute(pool)
    .await
    .expect("custom cost update should succeed");
}

async fn delete_custom_cost(pool: &sqlx::PgPool, project_id: Uuid, provider: &str, model: &str) {
    sqlx::query(
        "DELETE FROM custom_model_costs
         WHERE project_id = $1 AND provider = $2 AND model = $3",
    )
    .bind(project_id)
    .bind(provider)
    .bind(model)
    .execute(pool)
    .await
    .expect("custom cost delete should succeed");
}

// ===== ModelInfo extraction tests =====

#[test]
fn test_model_info_basic() {
    let info = ModelInfo::extract("gpt-4o", Some("openai"));
    assert_eq!(info.model, "gpt-4o");
    assert_eq!(info.provider.as_deref(), Some("openai"));
    assert_eq!(info.raw_model, "gpt-4o");
    assert_eq!(info.model_without_snapshot, "gpt-4o");
}

#[test]
fn test_model_info_provider_from_model_prefix() {
    let info = ModelInfo::extract("anthropic/claude-sonnet-4-5", None);
    assert_eq!(info.provider.as_deref(), Some("anthropic"));
    assert_eq!(info.raw_model, "claude-sonnet-4-5");
}

#[test]
fn test_model_info_no_provider_no_slash() {
    let info = ModelInfo::extract("gpt-4o", None);
    assert!(info.provider.is_none());
    assert_eq!(info.raw_model, "gpt-4o");
}

#[test]
fn test_model_info_provider_case_insensitive() {
    let info = ModelInfo::extract("gpt-4o", Some("OpenAI"));
    assert_eq!(info.provider.as_deref(), Some("openai"));
}

#[test]
fn test_model_info_bedrock() {
    let info = ModelInfo::extract(
        "bedrock/us-east-1/anthropic.claude-v2",
        Some("bedrock"),
    );
    assert_eq!(info.provider.as_deref(), Some("bedrock"));
    assert_eq!(info.raw_model, "us-east-1/anthropic.claude-v2");
    assert_eq!(info.model, "bedrock/us-east-1/anthropic.claude-v2");
}

// ===== Snapshot suffix stripping tests =====

#[test]
fn test_model_info_openai_snapshot_suffix() {
    let info = ModelInfo::extract("gpt-4.1-nano-2025-04-14", Some("openai"));
    assert_eq!(info.raw_model, "gpt-4.1-nano-2025-04-14");
    assert_eq!(info.model_without_snapshot, "gpt-4.1-nano");
}

#[test]
fn test_model_info_anthropic_snapshot_suffix() {
    let info = ModelInfo::extract("claude-sonnet-4-5-20250514", Some("anthropic"));
    assert_eq!(info.raw_model, "claude-sonnet-4-5-20250514");
    assert_eq!(info.model_without_snapshot, "claude-sonnet-4-5");
}

#[test]
fn test_model_info_no_snapshot_suffix() {
    let info = ModelInfo::extract("gpt-4o", Some("openai"));
    assert_eq!(info.model_without_snapshot, "gpt-4o");
}

#[test]
fn test_model_info_snapshot_with_provider_prefix() {
    let info = ModelInfo::extract("openai/gpt-4o-2024-08-06", None);
    assert_eq!(info.raw_model, "gpt-4o-2024-08-06");
    assert_eq!(info.model_without_snapshot, "gpt-4o");
}

// ===== Lookup key generation tests =====

#[test]
fn test_lookup_keys_full() {
    let info = ModelInfo::extract(
        "bedrock/us-east-1/anthropic.claude-v2",
        Some("bedrock"),
    );
    let keys = info.lookup_keys();
    assert_eq!(
        keys,
        vec![
            "bedrock/us-east-1/anthropic.claude-v2",
            "bedrock/bedrock/us-east-1/anthropic.claude-v2",
            "bedrock/us-east-1/anthropic-claude-v2",
            "us-east-1/anthropic.claude-v2",
            "us-east-1/anthropic-claude-v2",
        ]
    );
}

#[test]
fn test_lookup_keys_provider_only() {
    let info = ModelInfo::extract("gpt-4o", Some("openai"));
    let keys = info.lookup_keys();
    assert_eq!(keys, vec!["openai/gpt-4o", "gpt-4o"]);
}

#[test]
fn test_lookup_keys_no_provider() {
    let info = ModelInfo::extract("gpt-4o", None);
    let keys = info.lookup_keys();
    assert_eq!(keys, vec!["gpt-4o"]);
}

#[test]
fn test_lookup_keys_inferred_provider() {
    let info = ModelInfo::extract("anthropic/claude-sonnet-4-5", None);
    let keys = info.lookup_keys();
    assert_eq!(
        keys,
        vec![
            "anthropic/claude-sonnet-4-5",
            "anthropic/anthropic/claude-sonnet-4-5",
            "claude-sonnet-4-5",
        ]
    );
}

#[test]
fn test_lookup_keys_with_openai_snapshot() {
    let info = ModelInfo::extract("gpt-4.1-nano-2025-04-14", Some("openai"));
    let keys = info.lookup_keys();
    assert_eq!(
        keys,
        vec![
            "openai/gpt-4.1-nano-2025-04-14",
            "openai/gpt-4.1-nano",
            "openai/gpt-4-1-nano",
            "gpt-4.1-nano-2025-04-14",
            "gpt-4.1-nano",
            "gpt-4-1-nano",
        ]
    );
}

#[test]
fn test_lookup_keys_with_anthropic_snapshot() {
    let info = ModelInfo::extract("anthropic/claude-sonnet-4-5-20250514", None);
    let keys = info.lookup_keys();
    assert_eq!(
        keys,
        vec![
            "anthropic/claude-sonnet-4-5-20250514",
            "anthropic/anthropic/claude-sonnet-4-5-20250514",
            "anthropic/claude-sonnet-4-5",
            "claude-sonnet-4-5-20250514",
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
    assert_float_eq(result.input_cost, 1000.0 * 0.000003 + 2000.0 * 0.0000003);
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
    assert_float_eq(result.input_cost, 1000.0 * 0.000003 + 3000.0 * 0.00000375);
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

#[test]
fn test_batch_with_reasoning_tokens_fallback_half() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "output_cost_per_reasoning_token": 0.00001,
    }));
    let input = SpanCostInput {
        prompt_tokens: 10_000,
        completion_tokens: 5000,
        reasoning_tokens: 3000,
        is_batch: true,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 10_000.0 * 0.000003 / 2.0);
    // base output = 5000 - 3000 = 2000 at half output rate
    // reasoning = 3000 at half reasoning rate
    assert_float_eq(
        result.output_cost,
        2000.0 * 0.000015 / 2.0 + 3000.0 * 0.00001 / 2.0,
    );
}

#[test]
fn test_batch_with_reasoning_tokens_explicit() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "output_cost_per_token_batches": 0.0000075,
        "output_cost_per_reasoning_token": 0.00001,
        "output_cost_per_reasoning_token_batches": 0.000005,
    }));
    let input = SpanCostInput {
        prompt_tokens: 10_000,
        completion_tokens: 5000,
        reasoning_tokens: 3000,
        is_batch: true,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(
        result.output_cost,
        2000.0 * 0.0000075 + 3000.0 * 0.000005,
    );
}

#[test]
fn test_batch_with_audio_tokens_fallback_half() {
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
        is_batch: true,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    // base input = 1000 - 200 = 800 at half input rate, audio at half audio rate
    assert_float_eq(
        result.input_cost,
        800.0 * 0.000003 / 2.0 + 200.0 * 0.00011 / 2.0,
    );
    // base output = 500 - 100 = 400 at half output rate, audio at half audio rate
    assert_float_eq(
        result.output_cost,
        400.0 * 0.000015 / 2.0 + 100.0 * 0.00022 / 2.0,
    );
}

#[test]
fn test_batch_with_audio_tokens_explicit() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "input_cost_per_token_batches": 0.0000015,
        "output_cost_per_token_batches": 0.0000075,
        "input_cost_per_audio_token": 0.00011,
        "output_cost_per_audio_token": 0.00022,
        "input_cost_per_audio_token_batches": 0.000055,
        "output_cost_per_audio_token_batches": 0.00011,
    }));
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        audio_input_tokens: 200,
        audio_output_tokens: 100,
        is_batch: true,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(
        result.input_cost,
        800.0 * 0.0000015 + 200.0 * 0.000055,
    );
    assert_float_eq(
        result.output_cost,
        400.0 * 0.0000075 + 100.0 * 0.00011,
    );
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
    // prompt_tokens includes audio_input_tokens, so base = 1000 - 200 = 800
    // completion_tokens includes audio_output_tokens, so base = 500 - 100 = 400
    assert_float_eq(result.input_cost, 800.0 * 0.000003 + 200.0 * 0.00011);
    assert_float_eq(result.output_cost, 400.0 * 0.000015 + 100.0 * 0.00022);
}

#[test]
fn test_audio_tokens_fallback() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
    }));
    // No audio-specific costs, fallback to regular rate.
    // Since audio tokens are subtracted from base and then re-added at the same rate,
    // the total equals prompt_tokens * rate (no double-counting).
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        audio_input_tokens: 200,
        audio_output_tokens: 100,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    // (1000 - 200) * rate + 200 * rate = 1000 * rate
    assert_float_eq(result.input_cost, 1000.0 * 0.000003);
    // (500 - 100) * rate + 100 * rate = 500 * rate
    assert_float_eq(result.output_cost, 500.0 * 0.000015);
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
    // completion_tokens includes reasoning_tokens, so base = 500 - 300 = 200
    assert_float_eq(result.output_cost, 200.0 * 0.000015 + 300.0 * 0.00001);
}

#[test]
fn test_reasoning_tokens_fallback() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
    }));
    // No reasoning-specific cost, fallback to regular rate.
    // Since reasoning tokens are subtracted then re-added at the same rate,
    // total = completion_tokens * rate (no double-counting).
    let input = SpanCostInput {
        prompt_tokens: 1000,
        completion_tokens: 500,
        reasoning_tokens: 300,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 1000.0 * 0.000003);
    // (500 - 300) * rate + 300 * rate = 500 * rate
    assert_float_eq(result.output_cost, 500.0 * 0.000015);
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
    assert_float_eq(result.input_cost, 10_000.0 * 0.0000015 + 2000.0 * 0.0000003);
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
    // prompt_tokens includes audio_input_tokens, so base = 200_000 - 1000 = 199_000
    assert_float_eq(result.input_cost, 199_000.0 * 0.000001 + 1000.0 * 0.000002);
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
    // prompt_tokens (5000) includes audio_input_tokens (10_000 > 5000),
    // so base_input = max(5000 - 10_000, 0) = 0 (all tokens are audio)
    // completion_tokens (2000) includes audio_output_tokens (8000 > 2000),
    // so base_output = max(2000 - 8000, 0) = 0
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
        0.0 * 0.0000055 + 10_000.0 * 0.00011 + 3000.0 * 0.00000275,
    );
    assert_float_eq(result.output_cost, 0.0 * 0.000022 + 8000.0 * 0.00022);
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
    // completion_tokens (5000) includes reasoning_tokens (20_000 > 5000),
    // base_output = max(5000 - 20_000, 0) = 0 (all output is reasoning)
    let input = SpanCostInput {
        prompt_tokens: 10_000,
        completion_tokens: 5000,
        reasoning_tokens: 20_000,
        service_tier: Some("priority".to_string()),
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(result.input_cost, 10_000.0 * 0.000006);
    assert_float_eq(result.output_cost, 0.0 * 0.00003 + 20_000.0 * 0.00001);
}

// ===== Threshold with cached tokens tests =====

#[test]
fn test_threshold_triggered_by_cached_tokens() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "cache_read_input_token_cost": 0.0000003,
        "input_cost_per_token_above_200k_tokens": 0.000006,
        "output_cost_per_token_above_200k_tokens": 0.00003,
        "cache_read_input_token_cost_above_200k_tokens": 0.0000006,
    }));
    // prompt_tokens alone (50k) is below 200k, but total context
    // (50k + 200k cached = 250k) exceeds the threshold.
    let input = SpanCostInput {
        prompt_tokens: 50_000,
        completion_tokens: 1000,
        cache_read_tokens: 200_000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    // Should use above-200k pricing for all token types
    assert_float_eq(
        result.input_cost,
        50_000.0 * 0.000006 + 200_000.0 * 0.0000006,
    );
    assert_float_eq(result.output_cost, 1000.0 * 0.00003);
}

#[test]
fn test_threshold_not_triggered_when_total_below() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "cache_read_input_token_cost": 0.0000003,
        "input_cost_per_token_above_200k_tokens": 0.000006,
        "output_cost_per_token_above_200k_tokens": 0.00003,
    }));
    // Total context (50k + 100k cached = 150k) is still below 200k threshold
    let input = SpanCostInput {
        prompt_tokens: 50_000,
        completion_tokens: 1000,
        cache_read_tokens: 100_000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    // Should use base pricing
    assert_float_eq(
        result.input_cost,
        50_000.0 * 0.000003 + 100_000.0 * 0.0000003,
    );
    assert_float_eq(result.output_cost, 1000.0 * 0.000015);
}

#[test]
fn test_threshold_triggered_by_cache_creation_tokens() {
    let costs = make_costs(json!({
        "input_cost_per_token": 0.000003,
        "output_cost_per_token": 0.000015,
        "cache_creation_input_token_cost": 0.00000375,
        "input_cost_per_token_above_200k_tokens": 0.000006,
        "output_cost_per_token_above_200k_tokens": 0.00003,
        "cache_creation_input_token_cost_above_200k_tokens": 0.0000075,
    }));
    // prompt_tokens (100k) + cache_creation_tokens (150k) = 250k > 200k
    let input = SpanCostInput {
        prompt_tokens: 100_000,
        completion_tokens: 500,
        cache_creation_tokens: 150_000,
        ..default_input()
    };
    let result = calculate_span_cost(&costs, &input);
    assert_float_eq(
        result.input_cost,
        100_000.0 * 0.000006 + 150_000.0 * 0.0000075,
    );
    assert_float_eq(result.output_cost, 500.0 * 0.00003);
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

// ===== find_applicable_threshold tests =====

#[test]
fn test_find_threshold_none_when_below_all() {
    let costs = json!({
        "input_cost_per_token": 0.000001,
        "input_cost_per_token_above_128k_tokens": 0.000002,
        "input_cost_per_token_above_200k_tokens": 0.000003,
    });
    let result = find_applicable_threshold(&costs, 100_000);
    assert!(result.is_none());
}

#[test]
fn test_find_threshold_none_when_exactly_at_boundary() {
    let costs = json!({
        "input_cost_per_token_above_128k_tokens": 0.000002,
    });
    let result = find_applicable_threshold(&costs, 128_000);
    assert!(result.is_none());
}

#[test]
fn test_find_threshold_matches_single() {
    let costs = json!({
        "input_cost_per_token_above_128k_tokens": 0.000002,
    });
    let result = find_applicable_threshold(&costs, 128_001).unwrap();
    assert_eq!(result.suffix, "128k");
    assert_eq!(result.value, 128_000);
}

#[test]
fn test_find_threshold_picks_highest_exceeded() {
    let costs = json!({
        "input_cost_per_token_above_128k_tokens": 0.000002,
        "input_cost_per_token_above_200k_tokens": 0.000003,
    });
    let result = find_applicable_threshold(&costs, 300_000).unwrap();
    assert_eq!(result.suffix, "200k");
    assert_eq!(result.value, 200_000);
}

#[test]
fn test_find_threshold_picks_lower_when_between() {
    let costs = json!({
        "input_cost_per_token_above_128k_tokens": 0.000002,
        "input_cost_per_token_above_200k_tokens": 0.000003,
    });
    // Above 128k but below 200k
    let result = find_applicable_threshold(&costs, 150_000).unwrap();
    assert_eq!(result.suffix, "128k");
    assert_eq!(result.value, 128_000);
}

#[test]
fn test_find_threshold_numeric_no_k_suffix() {
    let costs = json!({
        "input_cost_per_token_above_128000_tokens": 0.000002,
    });
    let result = find_applicable_threshold(&costs, 200_000).unwrap();
    assert_eq!(result.suffix, "128000");
    assert_eq!(result.value, 128_000);
}

#[test]
fn test_find_threshold_ignores_non_matching_keys() {
    let costs = json!({
        "input_cost_per_token": 0.000001,
        "output_cost_per_token": 0.000002,
        "cache_read_input_token_cost": 0.0000003,
        "input_cost_per_token_above_200k_tokens": 0.000003,
    });
    let result = find_applicable_threshold(&costs, 250_000).unwrap();
    assert_eq!(result.suffix, "200k");
}

#[test]
fn test_find_threshold_none_for_empty_object() {
    let costs = json!({});
    assert!(find_applicable_threshold(&costs, 300_000).is_none());
}

#[test]
fn test_find_threshold_none_for_non_object() {
    let costs = json!(42);
    assert!(find_applicable_threshold(&costs, 300_000).is_none());
}

#[test]
fn test_find_threshold_no_threshold_keys() {
    let costs = json!({
        "input_cost_per_token": 0.000001,
        "output_cost_per_token": 0.000002,
    });
    assert!(find_applicable_threshold(&costs, 300_000).is_none());
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
