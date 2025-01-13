use std::collections::HashMap;
use std::sync::Arc;

use actix_web::{post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::db::project_api_keys::ProjectApiKey;
use crate::db::{self, DB};
use crate::features::{is_feature_enabled, Feature};
use crate::routes::types::ResponseResult;
use crate::semantic_search::SemanticSearch;
use crate::traces::utils::json_value_to_string;

const DEFAULT_LIMIT: u32 = 10;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SemanticSearchRequest {
    query: String,
    dataset_id: Uuid,
    #[serde(default)]
    limit: Option<u32>,
    #[serde(default)]
    threshold: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SemanticSearchResult {
    dataset_id: Uuid,
    score: f32,
    data: HashMap<String, String>,
    content: String,
}

#[derive(Serialize)]
struct SemanticSearchResponse {
    results: Vec<SemanticSearchResult>,
}

#[post("/semantic-search")]
pub async fn semantic_search(
    params: web::Json<SemanticSearchRequest>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
    semantic_search: web::Data<Arc<dyn SemanticSearch>>,
) -> ResponseResult {
    if !is_feature_enabled(Feature::FullBuild) {
        let error = "Semantic search is not enabled. Please enable full build";
        return Ok(HttpResponse::NotImplemented().body(error));
    }

    let project_id = project_api_key.project_id;
    let semantic_search = semantic_search.into_inner();
    let params = params.into_inner();
    let dataset_id = params.dataset_id;

    let Some(dataset) = db::datasets::get_dataset(&db.pool, project_id, dataset_id).await? else {
        return Ok(HttpResponse::NotFound().body("Dataset not found"));
    };

    let payloads = vec![HashMap::from([(
        "datasource_id".to_string(),
        dataset_id.to_string(),
    )])];

    let query_res = semantic_search
        .query(
            &project_id.to_string(),
            params.query,
            params.limit.unwrap_or(DEFAULT_LIMIT),
            params.threshold,
            payloads,
        )
        .await?;

    let datapoint_ids = query_res
        .results
        .iter()
        // for some reason the id is stringified twice, i.e. `\"00000000-0000-0000-0000-000000000000\"`
        .map(|result| Uuid::parse_str(serde_json::from_str(&result.datapoint_id).unwrap()).unwrap())
        .collect();

    let datapoints =
        db::datapoints::get_full_datapoints_by_ids(&db.pool, dataset_id, datapoint_ids).await?;

    let indexed_on = dataset.indexed_on;

    let results = query_res
        .results
        .iter()
        .zip(datapoints)
        .map(|(vector_db_response_point, db_datapoint)| {
            let db_data =
                serde_json::from_value::<HashMap<String, Value>>(db_datapoint.data.clone())
                    .unwrap_or(HashMap::from([(
                        "data".to_string(),
                        db_datapoint.data.clone(),
                    )]));
            let data = db_data
                .iter()
                .map(|(k, v)| (k.clone(), json_value_to_string(v.clone())))
                .collect::<HashMap<String, String>>();
            let content = if let Some(index_column) = indexed_on.clone() {
                data.get(&index_column)
                    .cloned()
                    .unwrap_or(json_value_to_string(db_datapoint.data.clone()))
            } else {
                json_value_to_string(db_datapoint.data.clone())
            };

            SemanticSearchResult {
                dataset_id,
                score: vector_db_response_point.score,
                data,
                content,
            }
        })
        .collect();

    Ok(HttpResponse::Ok().json(SemanticSearchResponse { results }))
}
