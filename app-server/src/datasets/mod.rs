use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{pipeline::nodes::NodeInput, semantic_search::SemanticSearch};

pub mod datapoints;
pub mod utils;

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Dataset {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub project_id: Uuid,
    #[serde(default)]
    pub indexed_on: Option<String>,
}

impl Dataset {
    pub async fn index_new_points(
        &self,
        datapoints: Vec<datapoints::Datapoint>,
        semantic_search: Arc<SemanticSearch>,
        collection_name: String,
        new_index_column: Option<String>,
    ) -> anyhow::Result<()> {
        if let Some(index_column) = &new_index_column {
            let indexable_datapoints = datapoints.iter().filter(|datapoint| {
                serde_json::from_value::<HashMap<String, NodeInput>>(datapoint.data.clone())
                    .is_ok_and(|data| data.contains_key(index_column))
            });

            let vector_db_datapoints = indexable_datapoints
                .clone()
                .map(|datapoint| datapoint.into_vector_db_datapoint(index_column))
                .collect::<Vec<_>>();

            if !vector_db_datapoints.is_empty() {
                semantic_search
                    .index(vector_db_datapoints, collection_name)
                    .await?;
            }
        }
        Ok(())
    }
}
