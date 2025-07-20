use actix_web::{HttpResponse, get, web};
use serde::Deserialize;

use crate::{
    ch::datapoints as ch_datapoints,
    datasets::datapoints::Datapoint,
    db::{self, DB, project_api_keys::ProjectApiKey},
    routes::{PaginatedResponse, types::ResponseResult},
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
    clickhouse: web::Data<clickhouse::Client>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let query = params.into_inner();

    // Still get dataset metadata from PostgreSQL
    let dataset_id =
        db::datasets::get_dataset_id_by_name(&db.pool, &query.name, project_id).await?;

    // Get datapoints from ClickHouse
    let ch_datapoints = ch_datapoints::get_datapoints_paginated(
        clickhouse.clone(),
        project_id,
        dataset_id,
        Some(query.limit),
        Some(query.offset),
    )
    .await?;

    // Get total count from ClickHouse
    let total_count = ch_datapoints::count_datapoints(clickhouse, project_id, dataset_id).await?;

    // Convert CHDatapoints to Datapoints
    let datapoints: Vec<Datapoint> = ch_datapoints
        .into_iter()
        .map(|ch_dp| ch_dp.into())
        .collect();

    let response = PaginatedResponse {
        total_count,
        items: datapoints,
        any_in_project: total_count > 0,
    };

    Ok(HttpResponse::Ok().json(response))
}
