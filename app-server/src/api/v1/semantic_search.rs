use std::collections::HashMap;
use std::sync::Arc;

use actix_web::{post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::project_api_keys::ProjectApiKey;
use crate::db::{self, DB};
use crate::features::{is_feature_enabled, Feature};
use crate::routes::types::ResponseResult;
use crate::semantic_search::SemanticSearch;

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

    if db::datasets::get_dataset(&db.pool, project_id, dataset_id)
        .await?
        .is_none()
    {
        return Ok(HttpResponse::NotFound().body("Dataset not found"));
    }

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

    let results = query_res
        .results
        .iter()
        .map(|result| SemanticSearchResult {
            dataset_id,
            score: result.score,
            data: result.data.clone(),
            content: result.content.clone(),
        })
        .collect();

    Ok(HttpResponse::Ok().json(SemanticSearchResponse { results }))
}
