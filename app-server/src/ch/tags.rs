use anyhow::Result;
use chrono::Utc;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use crate::db::tags::{SpanTag, TagSource};

use super::utils::chrono_to_nanoseconds;

/// for inserting into clickhouse.
/// Don't change the order of the fields or their values
impl Into<u8> for TagSource {
    fn into(self) -> u8 {
        match self {
            TagSource::MANUAL => 0,
            TagSource::AUTO => 1,
            TagSource::CODE => 2,
        }
    }
}

#[derive(Row, Serialize, Deserialize)]
pub struct CHTag {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub class_id: Uuid,
    pub created_at: i64, // unix timestamp in nanoseconds
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    pub name: String,
    pub source: u8,
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
}

impl CHTag {
    pub fn new(project_id: Uuid, id: Uuid, name: String, source: TagSource, span_id: Uuid) -> Self {
        Self {
            project_id,
            // TODO: Remove this once we drop the class_id column
            class_id: Uuid::nil(),
            created_at: chrono_to_nanoseconds(Utc::now()),
            id,
            name,
            source: source.into(),
            span_id,
        }
    }
}

pub async fn insert_tag(
    client: clickhouse::Client,
    project_id: Uuid,
    name: String,
    source: TagSource,
    span_id: Uuid,
) -> Result<Uuid> {
    let id = Uuid::new_v4();
    let tag = CHTag::new(project_id, id, name, source, span_id);
    let ch_insert = client.insert("tags");
    match ch_insert {
        Ok(mut ch_insert) => {
            ch_insert.write(&tag).await?;
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(id),
                Err(e) => {
                    return Err(anyhow::anyhow!("Clickhouse tag insertion failed: {:?}", e));
                }
            }
        }
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Failed to insert tag into Clickhouse: {:?}",
                e
            ));
        }
    }
}

#[instrument(skip(client, tags))]
pub async fn insert_tags_batch(client: clickhouse::Client, tags: &[SpanTag]) -> Result<()> {
    if tags.is_empty() {
        return Ok(());
    }

    let ch_insert = client.insert("tags");
    match ch_insert {
        Ok(mut ch_insert) => {
            ch_insert = ch_insert.with_option("wait_for_async_insert", "0");
            for span_tag in tags {
                let id = Uuid::new_v4();
                let tag = CHTag::new(
                    span_tag.project_id,
                    id,
                    span_tag.name.clone(),
                    span_tag.source.clone(),
                    span_tag.span_id,
                );
                ch_insert.write(&tag).await?;
            }

            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => {
                    return Err(anyhow::anyhow!(
                        "Clickhouse batch tag insertion failed: {:?}",
                        e
                    ));
                }
            }
        }
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Failed to insert tags batch into Clickhouse: {:?}",
                e
            ));
        }
    }
}
