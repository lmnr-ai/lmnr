use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use serde_json::Value;
use uuid::Uuid;

use crate::db::datapoints::DBDatapoint;
use crate::semantic_search::{SemanticSearch, SemanticSearchTrait};
use crate::{datasets::Dataset, db::DB, pipeline::nodes::utils::render_template};

use super::NodeInput;

pub struct SemanticSearchPoint {
    pub datapoint_id: Uuid,
    pub dataset_id: Uuid,
    pub score: f32,
    pub data: HashMap<String, String>,
    pub content: String,
}

pub(super) async fn query_datasources(
    datasets: &Vec<Dataset>,
    semantic_search: Arc<SemanticSearch>,
    db: Arc<DB>,
    query: String,
    collection_name: String,
    limit: u32,
    threshold: f32,
) -> Result<Vec<SemanticSearchPoint>> {
    let payloads = datasets
        .iter()
        .map(|dataset| HashMap::from([("datasource_id".to_string(), dataset.id.to_string())]))
        .collect();

    let res = semantic_search
        .query(&collection_name, query, limit, threshold, payloads)
        .await?;

    let points = res
        .results
        .iter()
        .map(|result| SemanticSearchPoint {
            datapoint_id: Uuid::parse_str(serde_json::from_str(&result.datapoint_id).unwrap())
                .unwrap(),
            dataset_id: Uuid::parse_str(serde_json::from_str(&result.datasource_id).unwrap())
                .unwrap(),
            score: result.score,
            data: result.data.clone(),
            content: String::new(),
        })
        .collect::<Vec<_>>();

    let dataset_ids = points.iter().map(|p| p.dataset_id).collect::<Vec<Uuid>>();
    let datapoint_ids = points.iter().map(|p| p.datapoint_id).collect::<Vec<Uuid>>();

    let datapoints =
        crate::db::datapoints::get_full_datapoints_by_ids(&db.pool, dataset_ids, datapoint_ids)
            .await?;

    let dataset_ids_to_dataset = datasets
        .iter()
        .map(|dataset| (dataset.id, dataset))
        .collect::<HashMap<Uuid, &Dataset>>();

    let datapoint_ids_to_datapoint = datapoints
        .iter()
        .map(|datapoint| (datapoint.id, datapoint))
        .collect::<HashMap<Uuid, &DBDatapoint>>();

    let results = points
        .iter()
        .map(|point| {
            let db_datapoint = datapoint_ids_to_datapoint.get(&point.datapoint_id).unwrap();
            let dataset = dataset_ids_to_dataset.get(&point.dataset_id).unwrap();
            let db_data: HashMap<String, Value> =
                serde_json::from_value::<HashMap<String, Value>>(db_datapoint.data.clone())
                    .unwrap_or(HashMap::from([(
                        "data".to_string(),
                        db_datapoint.data.clone(),
                    )]));

            let content = if let Some(ref column) = dataset.indexed_on {
                db_data.get(column).unwrap().to_string()
            } else {
                String::new()
            };

            SemanticSearchPoint {
                datapoint_id: point.datapoint_id,
                dataset_id: point.dataset_id,
                score: point.score,
                data: db_data
                    .into_iter()
                    .map(|(k, v)| (k, v.to_string()))
                    .collect(),
                content,
            }
        })
        .collect();

    Ok(results)
}

pub(super) fn render_query_res_point(
    template: &String,
    res_point: &SemanticSearchPoint,
    relevance_index: usize,
) -> String {
    let mut data = res_point.data.clone();
    data.insert("relevance_index".to_string(), relevance_index.to_string());
    data.insert("score".to_string(), res_point.score.to_string());
    data.insert("content".to_string(), res_point.content.clone());
    let inputs: HashMap<String, NodeInput> = data.into_iter().map(|(k, v)| (k, v.into())).collect();
    render_template(template, &inputs)
}
