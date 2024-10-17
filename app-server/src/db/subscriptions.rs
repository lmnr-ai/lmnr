use std::sync::Arc;

use anyhow::Result;
use serde::Serialize;
use sqlx::{prelude::FromRow, PgPool};
use uuid::Uuid;

use super::DB;

#[derive(FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSubscriptionInfo {
    pub user_id: Uuid,
    pub stripe_customer_id: String,
    pub activated: bool,
}

pub async fn save_stripe_customer_id(
    pool: &PgPool,
    user_id: &Uuid,
    stripe_customer_id: &String,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO user_subscription_info 
        (user_id, stripe_customer_id) VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = $2",
    )
    .bind(user_id)
    .bind(stripe_customer_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_user_subscription_info(
    pool: &PgPool,
    user_id: &Uuid,
) -> Result<Option<UserSubscriptionInfo>> {
    let record = sqlx::query_as::<_, UserSubscriptionInfo>(
        "SELECT user_id, stripe_customer_id, activated
        FROM user_subscription_info WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(record)
}

pub async fn activate_stripe_customer(pool: &PgPool, stripe_customer_id: &String) -> Result<()> {
    sqlx::query(
        "UPDATE user_subscription_info SET
            activated = TRUE
        WHERE stripe_customer_id = $1",
    )
    .bind(stripe_customer_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn reset_workspace_usage(db: Arc<DB>, workspace_id: Uuid) -> Result<()> {
    sqlx::query(
        "UPDATE workspace_usage SET
            prev_span_count = span_count_since_reset,
            prev_event_count = event_count_since_reset,
            span_count_since_reset = 0,
            event_count_since_reset = 0,
            reset_time = now(),
            reset_reason = 'subscription_change'
        WHERE workspace_id = $1",
    )
    .bind(workspace_id)
    .execute(&db.pool)
    .await?;

    Ok(())
}

#[derive(FromRow)]
struct SubscriptionTierId {
    id: i64,
}

pub async fn add_seats(pool: &PgPool, workspace_id: &Uuid, seats: i64) -> Result<()> {
    sqlx::query(
        "UPDATE workspaces SET
            additional_seats = additional_seats + $2
        WHERE workspaces.id = $1",
    )
    .bind(workspace_id)
    .bind(seats)
    .execute(pool)
    .await?;

    Ok(())
}

/// returns true if this is an upgrade from free tier
pub async fn update_subscription(
    pool: &PgPool,
    workspace_id: &Uuid,
    product_id: &String,
    cancel: bool,
) -> Result<bool> {
    let product_id = if cancel { None } else { Some(product_id) };
    let existing_tier = sqlx::query_as::<_, SubscriptionTierId>(
        "SELECT tier_id as id
            FROM workspaces
            WHERE id = $1",
    )
    .bind(workspace_id)
    .fetch_one(pool)
    .await?;
    let is_upgrade_from_free = existing_tier.id == 1;
    sqlx::query(
        "UPDATE workspaces SET
                tier_id = CASE
                    WHEN $3 THEN 1
                    ELSE (SELECT id FROM subscription_tiers WHERE stripe_product_id = $2)
                END
            WHERE id = $1",
    )
    .bind(workspace_id)
    .bind(product_id)
    .bind(cancel)
    .execute(pool)
    .await?;
    Ok(is_upgrade_from_free)
}
