use std::collections::HashMap;
use std::sync::Arc;

use actix_web::{post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::db::datapoints::DBDatapoint;
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
    #[serde(default)]
    metadata_filters: Vec<HashMap<String, String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SemanticSearchResult {
    dataset_id: Uuid,
    score: f32,
    data: HashMap<String, String>,
    content: String,
    metadata: HashMap<String, String>,
}

#[derive(Serialize)]
struct SemanticSearchResponse {
    results: Vec<SemanticSearchResult>,
}

struct SemanticSearchPoint {
    datapoint_id: Uuid,
    score: f32,
    metadata: HashMap<String, String>,
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

    let payloads = params
        .metadata_filters
        .iter()
        .map(|filter| {
            let mut payload = filter
                .iter()
                .map(|(k, v)| (format!("data.{}", k), v.clone()))
                .collect::<HashMap<String, String>>();
            payload.insert("datasource_id".to_string(), dataset_id.to_string());
            payload
        })
        .collect::<Vec<_>>();
    let payloads = if payloads.is_empty() {
        vec![HashMap::from([(
            "datasource_id".to_string(),
            dataset_id.to_string(),
        )])]
    } else {
        payloads
    };

    let query_res = semantic_search
        .query(
            &project_id.to_string(),
            params.query,
            params.limit.unwrap_or(DEFAULT_LIMIT),
            params.threshold,
            payloads,
        )
        .await?;

    let points = query_res
        .results
        .iter()
        .map(|result| SemanticSearchPoint {
            datapoint_id: Uuid::parse_str(serde_json::from_str(&result.datapoint_id).unwrap())
                .unwrap(),
            score: result.score,
            metadata: result.data.clone(),
        })
        .collect::<Vec<_>>();

    let datapoint_ids = points.iter().map(|p| p.datapoint_id).collect::<Vec<Uuid>>();

    let datapoints =
        db::datapoints::get_full_datapoints_by_ids(&db.pool, vec![dataset_id], datapoint_ids)
            .await?;

    let datapoint_ids_to_datapoint = datapoints
        .iter()
        .map(|datapoint: &DBDatapoint| (datapoint.id, datapoint))
        .collect::<HashMap<Uuid, &DBDatapoint>>();

    let indexed_on = dataset.indexed_on;

    let results = points
        .iter()
        .map(|vector_db_response_point| {
            let db_datapoint = datapoint_ids_to_datapoint
                .get(&vector_db_response_point.datapoint_id)
                .unwrap();
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
                metadata: vector_db_response_point.metadata.clone(),
            }
        })
        .collect();

    Ok(HttpResponse::Ok().json(SemanticSearchResponse { results }))
}
