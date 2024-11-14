use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::labels::{DBSpanLabel, LabelJobStatus, LabelSource};

pub async fn insert_or_update_label(
    pool: &PgPool,
    client: clickhouse::Client,
    project_id: Uuid,
    id: Uuid,
    span_id: Uuid,
    class_id: Uuid,
    user_id: Option<Uuid>,
    label_name: String,
    value_key: String,
    value: f64,
    label_source: LabelSource,
    job_status: Option<LabelJobStatus>,
    reasoning: Option<String>,
) -> Result<DBSpanLabel> {
    let label = crate::db::labels::update_span_label(
        pool,
        id,
        span_id,
        value,
        user_id,
        class_id,
        &label_source,
        job_status,
        reasoning,
    )
    .await?;

    crate::ch::labels::insert_label(
        client,
        project_id,
        class_id,
        id,
        label_name,
        label_source,
        value_key,
        value,
        span_id,
    )
    .await?;

    Ok(label)
}
