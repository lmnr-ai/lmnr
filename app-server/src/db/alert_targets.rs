use serde::Deserialize;
use sqlx::{PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::notifications::AlertType;

/// Severity levels: 0 = info, 1 = warning, 2 = critical.
/// Defaults to critical when absent (historical alerts).
pub const DEFAULT_SEVERITY: u8 = 2;

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AlertMetadata {
    #[serde(default)]
    pub severities: Option<Vec<u8>>,
    #[serde(default)]
    pub skip_similar: Option<bool>,
}

impl AlertMetadata {
    pub fn skip_similar(&self) -> bool {
        // False by default to not break historical alerts
        self.skip_similar.unwrap_or(false)
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AlertInfo {
    pub id: Uuid,
    pub name: String,
    pub workspace_id: Uuid,
    #[sqlx(json)]
    pub metadata: AlertMetadata,
}

/// Look up all alerts for a given project and signal ID, optionally filtered by alert type.
/// Used by the clustering handler to discover which alerts match a signal.
pub async fn get_alerts_for_signal(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
    alert_type: Option<AlertType>,
) -> anyhow::Result<Vec<AlertInfo>> {
    let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(
        r#"
        SELECT a.id, a.name, p.workspace_id, a.metadata
        FROM alerts a
        INNER JOIN projects p ON p.id = a.project_id
        WHERE a.project_id = "#,
    );
    qb.push_bind(project_id)
        .push(" AND a.source_id = ")
        .push_bind(signal_id);

    if let Some(t) = alert_type {
        qb.push(" AND a.type = ").push_bind(t.as_str().to_owned());
    }

    let records = qb.build_query_as::<AlertInfo>().fetch_all(pool).await?;

    Ok(records)
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AlertDeliveryTarget {
    pub id: Uuid,
    pub r#type: String,
    pub email: Option<String>,
    pub channel_id: Option<String>,
    pub integration_id: Option<Uuid>,
}

/// Fetch all delivery targets for a specific alert by its ID and project.
pub async fn get_targets_for_alert(
    pool: &PgPool,
    alert_id: &Uuid,
    project_id: &Uuid,
) -> anyhow::Result<Vec<AlertDeliveryTarget>> {
    let targets = sqlx::query_as::<_, AlertDeliveryTarget>(
        "SELECT at.id, at.type, at.email, at.channel_id, at.integration_id
         FROM alert_targets at
         JOIN alerts a ON a.id = at.alert_id
         WHERE at.alert_id = $1 AND a.project_id = $2",
    )
    .bind(alert_id)
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(targets)
}
