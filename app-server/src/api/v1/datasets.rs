use actix_web::{get, web, HttpResponse};
use serde::Deserialize;

use crate::{
    db::{datapoints, datasets, project_api_keys::ProjectApiKey, DB},
    routes::{types::ResponseResult, PaginatedResponse},
};

#[derive(Deserialize)]
pub struct GetDatapointsRequestParams {
    name: String,
    limit: i64,
    offset: i64,
}

#[get("/datasets/datapoints")]
async fn get_datapoints(
    params: web::Query<GetDatapointsRequestParams>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let query = params.into_inner();

    let dataset = datasets::get_dataset_by_name(&db.pool, &query.name, project_id).await?;

    let Some(dataset) = dataset else {
        return Ok(HttpResponse::NotFound().body(format!("dataset {} not found", &query.name)));
    };

    let datapoints =
        datapoints::get_datapoints(&db.pool, dataset.id, query.limit, query.offset).await?;

    let total_count = datapoints::count_datapoints(&db.pool, dataset.id).await?;

    let response = PaginatedResponse {
        total_count,
        items: datapoints,
        any_in_project: total_count > 0,
    };

    Ok(HttpResponse::Ok().json(response))
}
