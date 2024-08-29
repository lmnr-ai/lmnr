use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;

use crate::semantic_search::SemanticSearch;
use crate::{
    datasets::Dataset, pipeline::nodes::utils::render_template,
    semantic_search::semantic_search_grpc::query_response::QueryPoint,
};

use super::NodeInput;

pub(super) async fn query_datasources(
    datasets: &Vec<Dataset>,
    semantic_search: Arc<SemanticSearch>,
    query: String,
    collection_name: String,
    limit: u32,
    threshold: f32,
) -> Result<Vec<QueryPoint>> {
    let payloads = datasets
        .iter()
        .map(|dataset| HashMap::from([("datasource_id".to_string(), dataset.id.to_string())]))
        .collect();

    let res = semantic_search
        .query(&collection_name, query, limit, threshold, payloads)
        .await?;

    Ok(res.results)
}

pub(super) fn render_query_res_point(
    template: &String,
    res_point: &QueryPoint,
    relevance_index: usize,
) -> String {
    let mut data = res_point.data.clone();
    data.insert("relevance_index".to_string(), relevance_index.to_string());
    let inputs: HashMap<String, NodeInput> = data.into_iter().map(|(k, v)| (k, v.into())).collect();
    render_template(template, &inputs)
}
