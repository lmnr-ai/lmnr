use anyhow::Result;
use chrono::Utc;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::labels::LabelSource;

use super::utils::chrono_to_nanoseconds;

/// for inserting into clickhouse.
/// Don't change the order of the fields or their values
impl Into<u8> for LabelSource {
    fn into(self) -> u8 {
        match self {
            LabelSource::MANUAL => 0,
            LabelSource::AUTO => 1,
            LabelSource::CODE => 2,
        }
    }
}

#[derive(Row, Serialize, Deserialize)]
pub struct CHLabel {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub class_id: Uuid,
    pub created_at: i64, // unix timestamp in nanoseconds
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    pub name: String,
    pub label_source: u8,
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
}

impl CHLabel {
    pub fn new(
        project_id: Uuid,
        class_id: Uuid,
        id: Uuid,
        name: String,
        label_source: LabelSource,
        span_id: Uuid,
    ) -> Self {
        Self {
            project_id,
            class_id,
            created_at: chrono_to_nanoseconds(Utc::now()),
            id,
            name,
            label_source: label_source.into(),
            span_id,
        }
    }
}

pub async fn insert_label(
    client: clickhouse::Client,
    project_id: Uuid,
    class_id: Uuid,
    id: Uuid,
    name: String,
    label_source: LabelSource,
    span_id: Uuid,
) -> Result<()> {
    let label = CHLabel::new(project_id, class_id, id, name, label_source, span_id);
    let ch_insert = client.insert("labels");
    match ch_insert {
        Ok(mut ch_insert) => {
            ch_insert.write(&label).await?;
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => {
                    return Err(anyhow::anyhow!(
                        "Clickhouse label insertion failed: {:?}",
                        e
                    ));
                }
            }
        }
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Failed to insert label into Clickhouse: {:?}",
                e
            ));
        }
    }
}

pub async fn delete_label(
    client: clickhouse::Client,
    project_id: Uuid,
    span_id: Uuid,
    id: Uuid,
) -> Result<()> {
    // Note, this does not immediately physically delete the data.
    // https://clickhouse.com/docs/en/sql-reference/statements/delete
    client
        .query("DELETE FROM labels WHERE project_id = ? AND span_id = ? AND id = ?")
        .bind(project_id)
        .bind(span_id)
        .bind(id)
        .execute()
        .await?;
    Ok(())
}
