use std::{collections::HashMap, sync::Arc};

use crate::db;
use chrono::{DateTime, Utc};
use datapoints::Datapoint;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{pipeline::nodes::NodeInput, semantic_search::SemanticSearch};

pub mod datapoints;
pub mod utils;

#[derive(Debug, Clone, Deserialize, Serialize)]
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

pub async fn import_from_run_ids(
    pool: &sqlx::PgPool,
    project_id: &Uuid,
    dataset_id: &Uuid,
    semantic_search: Arc<SemanticSearch>,
    run_ids: &Vec<Uuid>,
    node_ids: &Option<Vec<Uuid>>,
) -> anyhow::Result<()> {
    let logs = db::trace::get_all_node_outputs(pool, &run_ids, node_ids).await?;

    let dataset = db::datasets::get_dataset(pool, project_id.clone(), dataset_id.clone()).await?;

    let datapoints = run_ids
        .iter()
        .filter_map(|run_id| {
            logs.get(run_id).map(|outputs| Datapoint {
                id: Uuid::new_v4(),
                dataset_id: dataset_id.clone(),
                data: serde_json::json!(outputs),
                target: serde_json::Value::Object(Default::default()),
            })
        })
        .collect();

    let datapoints = db::datapoints::insert_datapoints(pool, dataset_id, datapoints).await?;

    if dataset.indexed_on.is_some() {
        dataset
            .index_new_points(
                datapoints.clone(),
                semantic_search.clone(),
                project_id.to_string(),
                dataset.indexed_on.clone(),
            )
            .await?;
    }
    Ok(())
}
