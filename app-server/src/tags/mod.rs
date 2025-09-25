use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::tags::TagSource;

pub async fn create_tag(
    pool: &PgPool,
    client: clickhouse::Client,
    project_id: Uuid,
    span_id: Uuid,
    tag_name: String,
    source: TagSource,
) -> Result<Uuid> {
    let id = Uuid::new_v4();
    crate::db::tags::insert_tag_class(pool, project_id, &tag_name).await?;

    crate::ch::tags::insert_tag(client, project_id, id, tag_name, source, span_id).await?;

    Ok(id)
}
