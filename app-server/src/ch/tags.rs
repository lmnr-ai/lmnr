use anyhow::Result;
use chrono::Utc;
use clickhouse::{Row, insert::Insert};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::tags::{SpanTag, TagSource};

use super::utils::chrono_to_nanoseconds;
use super::{ClickhouseInsertable, DataPlaneBatch, Table};

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

#[derive(Row, Serialize, Deserialize, Clone, Debug)]
pub struct CHTag {
    #[serde(with = "clickhouse::serde::uuid")]
    project_id: Uuid,
    created_at: i64, // unix timestamp in nanoseconds
    #[serde(with = "clickhouse::serde::uuid")]
    id: Uuid,
    name: String,
    source: u8,
    #[serde(with = "clickhouse::serde::uuid")]
    span_id: Uuid,
}

impl CHTag {
    pub fn new(project_id: Uuid, id: Uuid, name: String, source: TagSource, span_id: Uuid) -> Self {
        Self {
            project_id,
            created_at: chrono_to_nanoseconds(Utc::now()),
            id,
            name,
            source: source.into(),
            span_id,
        }
    }
}

impl From<&SpanTag> for CHTag {
    fn from(tag: &SpanTag) -> Self {
        Self::new(
            tag.project_id,
            Uuid::new_v4(),
            tag.name.clone(),
            tag.source.clone(),
            tag.span_id,
        )
    }
}

impl ClickhouseInsertable for CHTag {
    const TABLE: Table = Table::Tags;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert.with_option("wait_for_async_insert", "0")
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::Tags(items)
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
    let ch_insert = client.insert::<CHTag>("tags").await;
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
