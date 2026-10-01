use anyhow::{Result, anyhow};
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, FromRow)]
pub struct SignalCreditState {
    pub granted_micro_usd: i64,
    pub remaining_micro_usd: i64,
}

/// Reconcile the workspace's lifetime Signals credit against gross usage in
/// the current billing period. The row lock serializes frontend checks and
/// app-server updates so concurrent runs cannot spend the credit twice.
pub async fn reconcile_signal_credit(
    pool: &PgPool,
    workspace_id: Uuid,
    period_start: DateTime<Utc>,
    current_period_cost_micro_usd: i64,
) -> Result<SignalCreditState> {
    let current_period_cost_micro_usd = current_period_cost_micro_usd.max(0);
    let state = sqlx::query_as::<_, SignalCreditState>(
        r#"
        WITH current_state AS (
            SELECT
                id,
                signal_credit_granted_micro_usd AS granted_micro_usd,
                signal_credit_remaining_micro_usd AS remaining_micro_usd,
                CASE
                    WHEN date_trunc('milliseconds', signal_credit_period_start) =
                         date_trunc('milliseconds', $2::timestamptz)
                    THEN signal_credit_applied_micro_usd
                    ELSE 0
                END AS previously_applied_micro_usd
            FROM workspaces
            WHERE id = $1
            FOR UPDATE
        ), reconciled AS (
            SELECT
                id,
                granted_micro_usd,
                remaining_micro_usd + previously_applied_micro_usd AS available_this_period_micro_usd,
                GREATEST(
                    previously_applied_micro_usd,
                    LEAST(
                        remaining_micro_usd + previously_applied_micro_usd,
                        GREATEST($3, 0)
                    )
                ) AS applied_this_period_micro_usd,
                previously_applied_micro_usd
            FROM current_state
        )
        UPDATE workspaces
        SET
            signal_credit_remaining_micro_usd =
                reconciled.available_this_period_micro_usd - reconciled.applied_this_period_micro_usd,
            signal_credit_applied_micro_usd = reconciled.applied_this_period_micro_usd,
            signal_credit_period_start = date_trunc('milliseconds', $2::timestamptz)
        FROM reconciled
        WHERE workspaces.id = reconciled.id
        RETURNING
            reconciled.granted_micro_usd,
            workspaces.signal_credit_remaining_micro_usd AS remaining_micro_usd
        "#,
    )
    .bind(workspace_id)
    .bind(period_start)
    .bind(current_period_cost_micro_usd)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| anyhow!("Workspace [{workspace_id}] not found while reconciling Signals credit"))?;

    Ok(state)
}
