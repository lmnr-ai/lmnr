use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::labels::{DBSpanLabel, LabelSource};

pub async fn insert_or_update_label(
    pool: &PgPool,
    client: clickhouse::Client,
    project_id: Uuid,
    id: Uuid,
    span_id: Uuid,
    class_id: Option<Uuid>,
    user_email: Option<String>,
    label_name: String,
    label_source: LabelSource,
    reasoning: Option<String>,
) -> Result<DBSpanLabel> {
    let label = crate::db::labels::update_span_label(
        pool,
        id,
        span_id,
        user_email,
        class_id,
        &label_source,
        reasoning,
        project_id,
        &label_name,
    )
    .await?;

    let class_id = class_id.unwrap_or(label.class_id);

    crate::ch::labels::insert_label(
        client,
        project_id,
        class_id,
        id,
        label_name,
        label_source,
        span_id,
    )
    .await?;

    Ok(label)
}
