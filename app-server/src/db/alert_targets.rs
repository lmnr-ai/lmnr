use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

/// Severity levels: 0 = info, 1 = warning, 2 = critical.
/// Defaults to critical when absent (historical alerts).
const DEFAULT_SEVERITY: u8 = 2;

#[derive(Debug, Clone, Deserialize, Default)]
pub struct AlertMetadata {
    pub severity: Option<u8>,
}

impl AlertMetadata {
    pub fn severity(&self) -> u8 {
        self.severity.unwrap_or(DEFAULT_SEVERITY)
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AlertInfo {
    pub alert_id: Uuid,
    pub workspace_id: Uuid,
    #[sqlx(json)]
    pub metadata: AlertMetadata,
}

/// Look up all alerts for a given project and signal ID.
/// Used by the clustering handler to discover which alerts match a signal.
pub async fn get_alerts_for_signal(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
) -> anyhow::Result<Vec<AlertInfo>> {
    let records = sqlx::query_as::<_, AlertInfo>(
        r#"
        SELECT a.id AS alert_id, p.workspace_id, a.metadata
        FROM alerts a
        INNER JOIN projects p ON p.id = a.project_id
        WHERE a.project_id = $1
          AND a.source_id = $2
        "#,
    )
    .bind(project_id)
    .bind(signal_id)
    .fetch_all(pool)
    .await?;

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
