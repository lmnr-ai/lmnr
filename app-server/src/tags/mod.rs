use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::tags::{DBSpanTag, TagSource};

pub async fn insert_or_update_tag(
    pool: &PgPool,
    client: clickhouse::Client,
    project_id: Uuid,
    id: Uuid,
    span_id: Uuid,
    class_id: Option<Uuid>,
    user_email: Option<String>,
    tag_name: String,
    source: TagSource,
) -> Result<DBSpanTag> {
    let tag = crate::db::tags::update_span_tag(
        pool, id, span_id, user_email, class_id, &source, project_id, &tag_name,
    )
    .await?;

    let class_id = class_id.unwrap_or(tag.class_id);

    crate::ch::tags::insert_tag(client, project_id, class_id, id, tag_name, source, span_id)
        .await?;

    Ok(tag)
}
